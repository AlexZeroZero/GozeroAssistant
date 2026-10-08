use serde::Serialize;
use serde_json::{json,Value};
#[repr(C)]
#[derive(Clone,Copy,Default,Serialize)]
struct CpuRow {id:u32,group:u16,logical:u8,core:u8,cache:u8,numa:u8,efficiency:u8,flags:u8}
extern "C" {
 fn gozero_cpu_rows(out:*mut CpuRow,capacity:u32)->u32;
 fn gozero_bind(group:u16,logical:u8)->i32;
 fn gozero_memory_options(large_pages:i32,prefer_numa:i32);
 fn gozero_memory_kind()->i32;
 fn gozero_memory_node()->u32;
 fn gozero_large_page_minimum()->usize;
}
pub fn info()->Value{
 let mut rows=vec![CpuRow::default();4096];
 let count=unsafe{gozero_cpu_rows(rows.as_mut_ptr(),rows.len() as u32)} as usize;
 rows.truncate(count.min(rows.len()));
 json!({"version":env!("CARGO_PKG_VERSION"),"streamPrefetch":std::is_x86_feature_detected!("avx2"),"avx2":std::is_x86_feature_detected!("avx2"),"avx512f":std::is_x86_feature_detected!("avx512f"),"largePageMinimum":unsafe{gozero_large_page_minimum()},"cpus":rows})
}
pub fn configure(large_pages:bool,binding:Option<(u16,u8)>)->Value{
 let bound=binding.map(|(g,l)|unsafe{gozero_bind(g,l)!=0});
 unsafe{gozero_memory_options(if large_pages{1}else{0},if bound==Some(true){1}else{0})};
 json!({"requested":binding,"bound":bound})
}
pub fn memory_info()->Value{
 let kind=unsafe{gozero_memory_kind()};let node=unsafe{gozero_memory_node()};
 json!({"largePages":kind==2,"numaPreferred":kind>0 && node!=u32::MAX,"numaNode":if node==u32::MAX{None}else{Some(node)}})
}
