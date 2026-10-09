use std::{cell::Cell,marker::PhantomData,rc::Rc};
#[allow(dead_code)]
#[path="../vendor/blocknet/pow.rs"]
pub mod official;
pub const HEADER_BYTES:usize=92;
extern "C" {
    fn gozero_prepare()->i32;
    fn gozero_hash(header:*const u8,nonce:u64,out:*mut u8)->i32;
    fn gozero_release();
    fn gozero_available()->u64;
    fn gozero_total()->u64;
    fn gozero_pressure()->i32;
}
#[derive(Clone,Copy,Debug)]
pub enum Engine {Auto,Native,Official}
impl Engine {
    pub fn parse(s:&str)->Result<Self,String>{match s {"auto"=>Ok(Self::Auto),"native"=>Ok(Self::Native),"official"=>Ok(Self::Official),_=>Err("engine must be auto/native/official".into())}}
    pub fn supported(self)->bool{true}
    pub fn resolved(self)->Self{if matches!(self,Self::Auto){Self::Native}else{self}}
}
thread_local!{static ACTIVE:Cell<bool>=const{Cell::new(false)};}
pub struct Worker {engine:Engine,_thread:PhantomData<Rc<()>>}
impl Worker {
    pub fn new(engine:Engine)->Result<Self,String>{
        let engine=engine.resolved();
        if matches!(engine,Engine::Native){
            if ACTIVE.with(Cell::get){return Err("One workspace per OS thread".into());}
            if unsafe{gozero_prepare()}!=0{return Err("2 GiB allocation failed".into());}
            ACTIVE.with(|v|v.set(true));
        }
        Ok(Self{engine,_thread:PhantomData})
    }
    pub fn hash(&mut self,header:&[u8;92],nonce:u64)->Result<[u8;32],String>{
        let mut out=[0;32];let code=match self.engine{
            Engine::Official=>official::blocknet_pow_hash(header.as_ptr(),92,nonce,out.as_mut_ptr()),
            _=>unsafe{gozero_hash(header.as_ptr(),nonce,out.as_mut_ptr())}};
        if code!=0{return Err(format!("Argon2 error {code}"));}Ok(out)
    }
}
impl Drop for Worker {fn drop(&mut self){if matches!(self.engine,Engine::Native){unsafe{gozero_release()};ACTIVE.with(|v|v.set(false));}}}
pub fn memory()->(u64,u64){unsafe{(gozero_total(),gozero_available())}}
// A memory snapshot guides concurrency, not an extra fixed 4 GiB veto.
// Inactive pages are reclaimable by macOS; compressed/swap bytes are NOT added.
const PER_WORKER:u64=(2u64<<30)+(128<<20);
pub fn thread_budget(total:u64,available:u64,pressure:i32,logical:u64)->u64{
    if total==0||pressure>=4{return 0;}
    let headroom=(total/32).clamp(512<<20,1<<30);
    let n=(available.saturating_sub(headroom)/PER_WORKER).min(logical).min(8);
    if pressure==2 {n.min(1)}else{n}
}
pub fn capacity()->u64{
    let(total,available)=memory();thread_budget(total,available,unsafe{gozero_pressure()},std::thread::available_parallelism().map(|n|n.get() as u64).unwrap_or(1))
}
pub fn ensure_memory_budget(workers:usize)->Result<(),String>{
    if workers==0 || workers as u64>capacity(){return Err("BNT memory pressure/budget does not currently allow another 2 GiB worker".into());}Ok(())
}
pub fn hex(b:&[u8])->String{b.iter().map(|v|format!("{v:02x}")).collect()}
pub fn unhex<const N:usize>(s:&str)->Result<[u8;N],String>{
    if s.len()!=N*2||!s.is_ascii(){return Err("Invalid hex size".into());}
    let mut out=[0;N];for(i,b)in out.iter_mut().enumerate(){*b=u8::from_str_radix(&s[2*i..2*i+2],16).map_err(|_|"Invalid hex")?;}Ok(out)
}
pub fn meets_target(hash:&[u8;32],target:&[u8;32])->bool{hash<=target}
pub mod platform{
    use serde_json::{json,Value};
    pub fn info()->Value{let(total,available)=super::memory();json!({"version":env!("CARGO_PKG_VERSION"),"arch":"arm64","backend":"CPU / PHC C","memoryKiBPerWorker":2097152,"totalMemory":total,"availableMemory":available,"pressureLevel":unsafe{super::gozero_pressure()},"headroomBytes":(total/32).clamp(512<<20,1<<30),"maxThreads":super::capacity()})}
    pub fn configure(_pages:bool,_binding:Option<(u16,u8)>)->Value{json!({"bound":false,"scheduler":"macOS"})}
    pub fn memory_info()->Value{json!({"largePages":false,"numaPreferred":false,"reused":true})}
}
#[cfg(test)]mod tests{use super::*;#[test]fn encoding(){assert!(unhex::<2>("00ff").is_ok());assert!(unhex::<2>("zzzz").is_err());assert!(meets_target(&[1;32],&[1;32]));assert!(!meets_target(&[2;32],&[1;32]));assert!(Engine::parse("avx2").is_err());}}

#[cfg(test)]mod memory_tests{
    use super::*;
    #[test]fn normal_reclaimable_memory_allows_work(){assert_eq!(thread_budget(16<<30,3<<30,1,8),1);assert_eq!(thread_budget(16<<30,6<<30,1,8),2);}
    #[test]fn insufficient_memory_and_pressure(){assert_eq!(thread_budget(16<<30,2<<30,1,8),0);assert_eq!(thread_budget(16<<30,8<<30,2,8),1);assert_eq!(thread_budget(16<<30,8<<30,4,8),0);assert_eq!(thread_budget(0,8<<30,1,8),0);}
    #[test]fn boundary_and_unknown_pressure(){let limit=(512<<20)+PER_WORKER;assert_eq!(thread_budget(16<<30,limit-1,0,8),0);assert_eq!(thread_budget(16<<30,limit,0,8),1);assert_eq!(thread_budget(128<<30,64<<30,1,128),8);}
}
