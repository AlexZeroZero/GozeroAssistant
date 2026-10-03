using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
[assembly: DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
class NvmlInfo {
 [DllImport("nvml.dll")] static extern int nvmlInit_v2();
 [DllImport("nvml.dll")] static extern int nvmlShutdown();
 [DllImport("nvml.dll")] static extern int nvmlDeviceGetCount_v2(out uint count);
 [DllImport("nvml.dll")] static extern int nvmlDeviceGetHandleByIndex_v2(uint index,out IntPtr device);
 [DllImport("nvml.dll",CharSet=CharSet.Ansi)] static extern int nvmlDeviceGetUUID(IntPtr device,StringBuilder uuid,uint length);
 [DllImport("nvml.dll")] static extern int nvmlDeviceGetNumGpuCores(IntPtr device,out uint cores);
 [DllImport("nvml.dll")] static extern int nvmlDeviceGetMemoryBusWidth(IntPtr device,out uint width);
 [DllImport("nvml.dll")] static extern int nvmlDeviceGetArchitecture(IntPtr device,out uint arch);
 static void Main() {
  var rows=new List<object>();bool init=false;
  try{
   init=nvmlInit_v2()==0;uint count;
   if(init&&nvmlDeviceGetCount_v2(out count)==0){
    for(uint i=0;i<count&&i<64;i++){
     IntPtr d;if(nvmlDeviceGetHandleByIndex_v2(i,out d)!=0)continue;
     var uuid=new StringBuilder(96);if(nvmlDeviceGetUUID(d,uuid,96)!=0)continue;
     uint value;uint? cores=null,width=null,arch=null;
     try{if(nvmlDeviceGetNumGpuCores(d,out value)==0&&value>0)cores=value;}catch(EntryPointNotFoundException){}
     try{if(nvmlDeviceGetMemoryBusWidth(d,out value)==0&&value>0)width=value;}catch(EntryPointNotFoundException){}
     try{if(nvmlDeviceGetArchitecture(d,out value)==0&&value!=0xffffffff)arch=value;}catch(EntryPointNotFoundException){}
     rows.Add(new{uuid=uuid.ToString(),cores=cores,memoryBusWidth=width,architecture=arch});
    }
   }
  }catch(DllNotFoundException){}catch(EntryPointNotFoundException){}
  finally{if(init)nvmlShutdown();}
  Console.WriteLine(new JavaScriptSerializer().Serialize(rows));
 }
}
