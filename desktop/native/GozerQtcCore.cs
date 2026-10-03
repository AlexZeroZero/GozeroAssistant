// Gozer QTC compute host, 2026-10-02. CUDA computation only, no wallet or network.
// qtc.cu derives from the Apache-2.0 Quantus reference. See LICENSE-Quantus.txt.
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
class GozerQtcCore {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr LoadLibraryEx(string file,IntPtr reserved,uint flags);
 [DllImport("nvcuda.dll")] static extern int cuInit(uint flags);
 [DllImport("nvcuda.dll")] static extern int cuDeviceGetByPCIBusId(out int device,string pci);
 [DllImport("nvcuda.dll")] static extern int cuDeviceGet(out int device,int ordinal);
 [DllImport("nvcuda.dll")] static extern int cuDeviceGetName(StringBuilder name,int length,int device);
 [DllImport("nvcuda.dll")] static extern int cuDevicePrimaryCtxRetain(out IntPtr ctx,int device);
 [DllImport("nvcuda.dll")] static extern int cuDevicePrimaryCtxRelease(int device);
 [DllImport("nvcuda.dll")] static extern int cuCtxSetCurrent(IntPtr ctx);
 [DllImport("nvcuda.dll")] static extern int cuModuleLoadDataEx(out IntPtr module,byte[] image,uint count,IntPtr options,IntPtr values);
 [DllImport("nvcuda.dll")] static extern int cuModuleGetFunction(out IntPtr function,IntPtr module,string name);
 [DllImport("nvcuda.dll")] static extern int cuModuleUnload(IntPtr module);
 [DllImport("nvcuda.dll")] static extern int cuMemAlloc_v2(out ulong ptr,UIntPtr size);
 [DllImport("nvcuda.dll")] static extern int cuMemFree_v2(ulong ptr);
 [DllImport("nvcuda.dll")] static extern int cuMemcpyHtoD_v2(ulong dst,uint[] data,UIntPtr size);
 [DllImport("nvcuda.dll")] static extern int cuMemcpyDtoH_v2(uint[] dst,ulong src,UIntPtr size);
 [DllImport("nvcuda.dll")] static extern int cuLaunchKernel(IntPtr f,uint gx,uint gy,uint gz,uint bx,uint by,uint bz,uint memory,IntPtr stream,IntPtr[] args,IntPtr extra);
 [DllImport("nvcuda.dll")] static extern int cuCtxSynchronize();
 public class Vector{public string header,nonce,hash;public string[] mid;}
 static void Check(int code){if(code!=0)throw new Exception("CUDA error "+code);}
 static uint[] Words(string hex){uint[] a=new uint[hex.Length/8];for(int i=0;i<a.Length;i++)a[i]=Convert.ToUInt32(hex.Substring(hex.Length-8*(i+1),8),16);return a;}
 static string Hex(uint[] words){var s=new StringBuilder();for(int i=words.Length-1;i>=0;i--)s.Append(words[i].ToString("x8"));return s.ToString();}
 static void Upload(ulong ptr,uint[] data){Check(cuMemcpyHtoD_v2(ptr,data,(UIntPtr)(data.Length*4)));}
 static uint[] Download(ulong ptr,int n){uint[] a=new uint[n];Check(cuMemcpyDtoH_v2(a,ptr,(UIntPtr)(n*4)));return a;}
 static IntPtr Arg64(ulong value){IntPtr p=Marshal.AllocHGlobal(8);Marshal.WriteInt64(p,unchecked((long)value));return p;}
 static IntPtr Arg32(uint value){IntPtr p=Marshal.AllocHGlobal(4);Marshal.WriteInt32(p,unchecked((int)value));return p;}
 static void Launch(IntPtr fn,uint count,uint block,params IntPtr[] args){try{Check(cuLaunchKernel(fn,(count+block-1)/block,1,1,block,1,1,0,IntPtr.Zero,args,IntPtr.Zero));Check(cuCtxSynchronize());}finally{foreach(var a in args)Marshal.FreeHGlobal(a);}}
 static void Hash(IntPtr fn,ulong output,ulong mid,ulong nonce,uint count){Launch(fn,count,128,Arg64(output),Arg64(mid),Arg64(nonce),Arg32(count));}
 static double Search(IntPtr fn,ulong output,ulong mid,ulong nonce,ulong target,uint count,uint block){Upload(output,new uint[9]);var t=Stopwatch.StartNew();Launch(fn,count,block,Arg64(output),Arg64(mid),Arg64(nonce),Arg64(target),Arg32(count));return t.Elapsed.TotalSeconds;}
 static int Main(string[] args){IntPtr module=IntPtr.Zero,ctx=IntPtr.Zero;int device=0;ulong output=0,mid=0,nonce=0,target=0;try{
  bool bench=false;int seconds=3,budget=50;string pci=null;
  for(int i=0;i<args.Length;i++){if(args[i]=="--self-test")continue;if(args[i]=="--benchmark"){bench=true;seconds=int.Parse(args[++i]);}else if(args[i]=="--pci")pci=args[++i];else if(args[i]=="--budget")budget=int.Parse(args[++i]);else throw new Exception("Unknown option");}
  if(seconds<1||seconds>15||budget<30||budget>90)throw new Exception("Benchmark limit exceeded");
  if(LoadLibraryEx(Path.Combine(Environment.SystemDirectory,"nvcuda.dll"),IntPtr.Zero,0x800)==IntPtr.Zero)throw new Exception("NVIDIA CUDA driver unavailable");
  Check(cuInit(0));if(pci!=null)Check(cuDeviceGetByPCIBusId(out device,pci));else Check(cuDeviceGet(out device,0));
  var name=new StringBuilder(256);Check(cuDeviceGetName(name,256,device));Check(cuDevicePrimaryCtxRetain(out ctx,device));Check(cuCtxSetCurrent(ctx));
  Check(cuModuleLoadDataEx(out module,File.ReadAllBytes(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"qtc.ptx")),0,IntPtr.Zero,IntPtr.Zero));
  IntPtr hashFn,searchFn,referenceFn;Check(cuModuleGetFunction(out hashFn,module,"hash_nonces"));Check(cuModuleGetFunction(out searchFn,module,"gozer_search"));Check(cuModuleGetFunction(out referenceFn,module,"gozer_search_reference"));
  Check(cuMemAlloc_v2(out output,(UIntPtr)4096));Check(cuMemAlloc_v2(out mid,(UIntPtr)96));Check(cuMemAlloc_v2(out nonce,(UIntPtr)64));Check(cuMemAlloc_v2(out target,(UIntPtr)64));
  var json=new JavaScriptSerializer();var vectors=json.Deserialize<Vector[]>(File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"vectors.json")));int checks=0;
  foreach(var v in vectors){var m=new uint[24];for(int i=0;i<12;i++){ulong x=Convert.ToUInt64(v.mid[i],16);m[i*2]=(uint)x;m[i*2+1]=(uint)(x>>32);}Upload(mid,m);Upload(nonce,Words(v.nonce));Hash(hashFn,output,mid,nonce,1);if(Hex(Download(output,16))!=v.hash)throw new Exception("Reference vector mismatch");checks++;
   var limit=Words(v.hash);Upload(target,limit);Search(searchFn,output,mid,nonce,target,1,128);if(Download(output,9)[0]!=1)throw new Exception("Equal target rejected");checks++;
   for(int i=0;i<limit.Length;i++){uint prior=limit[i];limit[i]--;if(prior!=0)break;}Upload(target,limit);Search(searchFn,output,mid,nonce,target,1,128);if(Download(output,9)[0]!=0)throw new Exception("Below-target accepted");checks++;
  }
  Upload(target,Words(new string('f',128)));Search(searchFn,output,mid,nonce,target,32,128);if(Download(output,9)[0]!=32)throw new Exception("Bounded result counter mismatch");checks++;
  double referenceRate=0,optimizedRate=0;double hashrate=0;uint selectedBlock=128;long tested=0;double elapsed=0;
  if(bench){Upload(target,new uint[16]);double referenceSeconds=0,optimizedSeconds=0;for(int i=0;i<10;i++){referenceSeconds+=Search(referenceFn,output,mid,nonce,target,65536,128);Thread.Sleep(10);optimizedSeconds+=Search(searchFn,output,mid,nonce,target,65536,128);Thread.Sleep(10);}referenceRate=655360/referenceSeconds;optimizedRate=655360/optimizedSeconds;double best=0;foreach(uint block in new uint[]{64,128,256}){double time=0;for(int i=0;i<3;i++){time+=Search(searchFn,output,mid,nonce,target,16384,block);Thread.Sleep(10);}double rate=49152/time;if(rate>best){best=rate;selectedBlock=block;}}
   uint batch=16384;var clock=Stopwatch.StartNew();uint[] baseNonce=Words(vectors[0].nonce);
   while(clock.Elapsed.TotalSeconds<seconds){Upload(nonce,baseNonce);double dt=Search(searchFn,output,mid,nonce,target,batch,selectedBlock);tested+=batch;ulong next=(ulong)baseNonce[0]+batch;baseNonce[0]=(uint)next;baseNonce[1]+=(uint)(next>>32);Thread.Sleep(Math.Max(1,(int)Math.Ceiling(dt*1000*(100.0/budget-1))));if(dt<.005&&batch<262144)batch*=2;else if(dt>.02&&batch>4096)batch/=2;}
   elapsed=clock.Elapsed.TotalSeconds;hashrate=tested/elapsed;
  }
  Console.WriteLine(json.Serialize(new{engine="Gozer QTC CUDA",version="0.1.0-experimental",algorithm="QTC Poseidon2",device=name.ToString(),pci=pci,referenceChecks=checks,passed=true,offline=true,poolConnected=false,hashrate=bench?(double?)hashrate:null,unit="H/s",seconds=elapsed,hashes=tested,budget=budget,blockSize=selectedBlock,referenceKernelHashrate=referenceRate,optimizedKernelHashrate=optimizedRate,kernelComparisonRatio=referenceRate>0?optimizedRate/referenceRate:0}));return 0;
 }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}finally{if(output!=0)cuMemFree_v2(output);if(mid!=0)cuMemFree_v2(mid);if(nonce!=0)cuMemFree_v2(nonce);if(target!=0)cuMemFree_v2(target);if(module!=IntPtr.Zero)cuModuleUnload(module);if(ctx!=IntPtr.Zero)cuDevicePrimaryCtxRelease(device);}}
}
