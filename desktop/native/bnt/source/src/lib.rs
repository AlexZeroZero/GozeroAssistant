use argon2::{Algorithm, Argon2, Block, Params, Version};
use std::{cell::Cell, marker::PhantomData, rc::Rc};

#[allow(dead_code)]
#[path = "../vendor/blocknet/pow.rs"]
pub mod official;

pub mod platform;

pub const MEMORY_KIB: u32 = 2 * 1024 * 1024;
pub const HEADER_BYTES: usize = 92;

extern "C" {
    fn gozero_prepare(kib: u32, engine: i32) -> i32;
    fn gozero_hash(header: *const u8, len: usize, nonce: u64, out: *mut u8, kib: u32) -> i32;
    fn gozero_release();
}

#[derive(Clone, Copy, Debug)]
pub enum Engine { Stream, Auto, Official, Reuse, Sse2, Avx2, Gozero, Prefetch, Avx512, Gozero512, Prefetch512 }
impl Engine {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "stream" => Ok(Self::Stream), "official" => Ok(Self::Official), "reuse" => Ok(Self::Reuse),
            "sse2" => Ok(Self::Sse2), "avx2" => Ok(Self::Avx2),
            "gozero" => Ok(Self::Gozero), "auto" => Ok(Self::Auto),
            "avx512" => Ok(Self::Avx512), "gozero512" => Ok(Self::Gozero512), "prefetch512" => Ok(Self::Prefetch512),
            "prefetch" => Ok(Self::Prefetch),
            _ => Err("engine must be auto/stream/official/reuse/sse2/avx2/gozero/prefetch/avx512/gozero512/prefetch512".into()),
        }
    }
    pub fn supported(self) -> bool {
        !matches!(self,Self::Avx512|Self::Gozero512|Self::Prefetch512) || (std::is_x86_feature_detected!("avx512f") && std::is_x86_feature_detected!("avx2"))
    }
    pub fn resolved(self) -> Self {
        if matches!(self,Self::Auto){return if std::is_x86_feature_detected!("avx2"){Self::Avx2}else{Self::Sse2}}
        if matches!(self, Self::Stream | Self::Gozero | Self::Avx2 | Self::Prefetch) && !std::is_x86_feature_detected!("avx2") { Self::Sse2 } else { self }
    }
}
thread_local! {static NATIVE_ACTIVE:Cell<bool> = const {Cell::new(false)};}

// Native allocation belongs to this OS thread. Do not move contexts across threads.
pub struct Worker {
    engine: Engine,
    memory: Vec<Block>,
    argon: Argon2<'static>,
    _thread_bound: PhantomData<Rc<()>>,
}
impl Worker {
    pub fn new(engine: Engine) -> Result<Self, String> {
        if !engine.supported(){return Err("AVX-512F is unavailable or disabled by the OS".into());}
        let engine = engine.resolved();
        let params = Params::new(MEMORY_KIB, 1, 1, Some(32)).map_err(|e| e.to_string())?;
        let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
        let mut memory = Vec::new();
        if matches!(engine, Engine::Reuse) {
            memory.try_reserve_exact(MEMORY_KIB as usize).map_err(|e| e.to_string())?;
            memory.resize(MEMORY_KIB as usize, Block::default());
        }
        let code = match engine { Engine::Stream => 8, Engine::Sse2 => 1, Engine::Avx2 => 2, Engine::Gozero => 3, Engine::Prefetch => 4, Engine::Avx512 => 5, Engine::Gozero512 => 6, Engine::Prefetch512 => 7, _ => 0 };
        if code > 0 {
            if NATIVE_ACTIVE.with(Cell::get) {return Err("Only one native workspace per OS thread is allowed".into());}
            if unsafe { gozero_prepare(MEMORY_KIB, code) } != 0 { return Err("2 GiB workspace allocation failed".into()); }
            NATIVE_ACTIVE.with(|v|v.set(true));
        }
        Ok(Self { engine, memory, argon, _thread_bound: PhantomData })
    }
    pub fn hash(&mut self, header: &[u8; HEADER_BYTES], nonce: u64) -> Result<[u8;32], String> {
        let mut out = [0u8;32];
        match self.engine {
            Engine::Official => {
                if official::blocknet_pow_hash(header.as_ptr(), header.len(), nonce, out.as_mut_ptr()) != 0 { return Err("official hash failed".into()); }
            }
            Engine::Reuse => self.argon.hash_password_into_with_memory(&nonce.to_le_bytes(), header, &mut out, &mut self.memory).map_err(|e| e.to_string())?,
            _ => if unsafe { gozero_hash(header.as_ptr(), header.len(), nonce, out.as_mut_ptr(), MEMORY_KIB) } != 0 { return Err("native hash failed".into()); },
        }
        Ok(out)
    }
}
impl Drop for Worker {
    fn drop(&mut self) { if matches!(self.engine, Engine::Stream | Engine::Sse2 | Engine::Avx2 | Engine::Gozero | Engine::Prefetch | Engine::Avx512 | Engine::Gozero512 | Engine::Prefetch512) { unsafe { gozero_release() }; NATIVE_ACTIVE.with(|v|v.set(false)); } }
}
#[cfg(windows)]
pub fn ensure_memory_budget(workers:usize)->Result<(),String> {
    #[repr(C)]
    struct MemoryStatus {length:u32, load:u32, total:u64, available:u64, page_total:u64, page_available:u64, virtual_total:u64, virtual_available:u64, extended:u64}
    #[link(name="kernel32")]
    extern "system" {fn GlobalMemoryStatusEx(info:*mut MemoryStatus)->i32;}
    let mut info=MemoryStatus {length:std::mem::size_of::<MemoryStatus>() as u32,load:0,total:0,available:0,page_total:0,page_available:0,virtual_total:0,virtual_available:0,extended:0};
    if unsafe{GlobalMemoryStatusEx(&mut info)}==0 {return Err("Cannot query available physical memory".into());}
    let reserve=(4*1024*1024*1024u64).max(info.total/10);
    let budget=info.available.saturating_sub(reserve);
    let required=(workers as u64).checked_mul(MEMORY_KIB as u64*1024+128*1024*1024).ok_or("Memory size overflow")?;
    if required>budget {return Err(format!("Not enough spare physical RAM for {workers} workers (2 GiB each); keeping at least 4 GiB or 10% of physical RAM free"));}
    Ok(())
}
#[cfg(not(windows))]
pub fn ensure_memory_budget(_workers:usize)->Result<(),String> {Err("This experimental launcher is validated on Windows only".into())}
pub fn hex(bytes: &[u8]) -> String { bytes.iter().map(|b| format!("{b:02x}")).collect() }
pub fn unhex<const N:usize>(s:&str) -> Result<[u8;N],String> {
    if s.len()!=N*2 || !s.is_ascii() { return Err(format!("expected {} hex characters",N*2)); }
    let mut out=[0u8;N];
    for (i,b) in out.iter_mut().enumerate() { *b=u8::from_str_radix(&s[i*2..i*2+2],16).map_err(|_|"invalid hex")?; }
    Ok(out)
}
pub fn meets_target(hash: &[u8;32], target:&[u8;32]) -> bool { hash <= target }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn encoding_and_target() {
        assert_eq!(unhex::<2>("00ff").unwrap(),[0,255]);
        assert!(unhex::<2>("zzzz").is_err()); assert!(unhex::<2>("00").is_err());
        assert!(meets_target(&[1;32], &[1;32]));
        assert!(!meets_target(&[2;32], &[1;32]));
        assert!(meets_target(&[0;32], &[1;32]));
    }
    #[test] fn rejects_two_native_contexts_on_one_thread() {
        let a=Worker::new(Engine::Sse2).unwrap();
        assert!(Worker::new(Engine::Sse2).is_err());
        drop(a);
        assert!(Worker::new(Engine::Sse2).is_ok());
    }
}
