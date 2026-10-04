// Windows Job Object owns the entire miner process tree. Closing the app,
// crashing the parent, closing stdin, or sending "stop" kills this job only.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Web.Script.Serialization;
using System.IO;
using System.Text.RegularExpressions;
class ProcessGuard {
 static volatile int duty=68;
 [DllImport("ntdll.dll")] static extern int NtSuspendProcess(IntPtr p);
 [DllImport("ntdll.dll")] static extern int NtResumeProcess(IntPtr p);
 [StructLayout(LayoutKind.Sequential)] struct Basic { public long User,Job; public uint Flags; public UIntPtr Min,Max; public uint Active; public UIntPtr Affinity; public uint Priority,Scheduling; }
 [StructLayout(LayoutKind.Sequential)] struct IO { public ulong ReadOp,WriteOp,OtherOp,ReadBytes,WriteBytes,OtherBytes; }
 [StructLayout(LayoutKind.Sequential)] struct Limits { public Basic Basic; public IO IO; public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob; }
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup { public int cb; public string reserved,desktop,title; public int x,y,cx,cy,xChars,yChars,fill,flags; public short show,reserved2; public IntPtr reservedPtr,input,output,error; }
 [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
 [StructLayout(LayoutKind.Sequential)] struct StartupEx {public Startup Startup;public IntPtr Attributes;}
 [StructLayout(LayoutKind.Sequential)] struct Security {public int Length;public IntPtr Descriptor;public int Inherit;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFile(string name,uint access,uint share,ref Security security,uint disposition,uint attributes,IntPtr template);
 [DllImport("kernel32.dll",EntryPoint="CreateProcessW",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessEx(string app,StringBuilder cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref StartupEx start,out ProcessInfo info);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
 [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr a,string n);
 [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job,int cls,ref Limits info,uint length);
 [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref Startup start,out ProcessInfo info);
 [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr t);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr p,uint c);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h,uint ms);
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h,out uint c);
 public class Request { public string exe {get;set;} public string cwd {get;set;} public string[] args {get;set;} public int duty {get;set;} public string capturePath {get;set;} public string cudaUuid {get;set;} }
 static string Quote(string s) { var b=new StringBuilder("\"");int slashes=0;foreach(char c in s){if(c=='\\'){slashes++;continue;}if(c=='\"'){b.Append('\\',slashes*2+1);b.Append(c);slashes=0;continue;}b.Append('\\',slashes);slashes=0;b.Append(c);}b.Append('\\',slashes*2);b.Append('"');return b.ToString(); }
 static int Main(string[] argv) {
  Console.InputEncoding=new UTF8Encoding(false,true);
  Console.OutputEncoding=new UTF8Encoding(false);
  IntPtr job=IntPtr.Zero,parent=IntPtr.Zero,output=IntPtr.Zero,input=IntPtr.Zero,attributes=IntPtr.Zero,handles=IntPtr.Zero;bool attributesReady=false;ProcessInfo p=new ProcessInfo();
  try {
   int parentId;if(argv.Length!=1||!int.TryParse(argv[0],out parentId))throw new Exception("Parent process required");
   parent=OpenProcess(0x100000,false,parentId);if(parent==IntPtr.Zero)throw new Exception("Parent unavailable");
   var line=Console.ReadLine();if(line==null||line.Length>16000)throw new Exception("Invalid request");
   var r=new JavaScriptSerializer().Deserialize<Request>(line);if(r==null||r.args==null||r.args.Length>100||!System.IO.Path.IsPathRooted(r.exe))throw new Exception("Invalid process configuration");
   if(r.duty!=0){if(r.duty<5||r.duty>90)throw new Exception("Invalid duty budget");duty=r.duty;}
   if(!String.IsNullOrEmpty(r.cudaUuid)){if(!Regex.IsMatch(r.cudaUuid,"^GPU-[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$"))throw new Exception("Invalid CUDA UUID");Environment.SetEnvironmentVariable("CUDA_DEVICE_ORDER","PCI_BUS_ID");Environment.SetEnvironmentVariable("CUDA_VISIBLE_DEVICES",r.cudaUuid);}
   job=CreateJobObject(IntPtr.Zero,null);if(job==IntPtr.Zero)throw new Exception("Cannot create job");
   var limits=new Limits();limits.Basic.Flags=0x2000;
   if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(limits)))throw new Exception("Cannot protect job");
   var cmd=new StringBuilder(Quote(r.exe));foreach(string a in r.args)cmd.Append(" ").Append(Quote(a));
   var si=new Startup();si.cb=Marshal.SizeOf(si);
   if(String.IsNullOrEmpty(r.capturePath)){
    if(!CreateProcess(r.exe,cmd,IntPtr.Zero,IntPtr.Zero,false,0x08000004,IntPtr.Zero,r.cwd,ref si,out p))throw new Exception("Cannot start process: "+Marshal.GetLastWin32Error());
   }else{
    string capture=Path.GetFullPath(r.capturePath),directory=Path.GetFullPath(r.cwd).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;if(!capture.StartsWith(directory,StringComparison.OrdinalIgnoreCase))throw new Exception("Output must stay in miner directory");
    var security=new Security();security.Length=Marshal.SizeOf(security);security.Inherit=1;
    output=CreateFile(capture,0x40000000,7,ref security,2,0x80,IntPtr.Zero);input=CreateFile("NUL",0x80000000,3,ref security,3,0x80,IntPtr.Zero);
    if(output==new IntPtr(-1)||input==new IntPtr(-1))throw new Exception("Cannot open captured output");
    IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);attributes=Marshal.AllocHGlobal(size);if(!InitializeProcThreadAttributeList(attributes,1,0,ref size))throw new Exception("Cannot initialize output handles");attributesReady=true;
    handles=Marshal.AllocHGlobal(IntPtr.Size*2);Marshal.WriteIntPtr(handles,0,input);Marshal.WriteIntPtr(handles,IntPtr.Size,output);
    if(!UpdateProcThreadAttribute(attributes,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*2),IntPtr.Zero,IntPtr.Zero))throw new Exception("Cannot isolate output handles");
    var extended=new StartupEx();extended.Startup=si;extended.Startup.cb=Marshal.SizeOf(extended);extended.Startup.flags=0x100;extended.Startup.input=input;extended.Startup.output=output;extended.Startup.error=output;extended.Attributes=attributes;
    if(!CreateProcessEx(r.exe,cmd,IntPtr.Zero,IntPtr.Zero,true,0x08080004,IntPtr.Zero,r.cwd,ref extended,out p))throw new Exception("Cannot start captured process: "+Marshal.GetLastWin32Error());
   }
   if(!AssignProcessToJobObject(job,p.process)){TerminateProcess(p.process,1);throw new Exception("Cannot bind process to protected job");}
   if(WaitForSingleObject(parent,0)==0)throw new Exception("Parent exited before start");
   if(ResumeThread(p.thread)==0xffffffff)throw new Exception("Cannot resume process");
   Console.WriteLine("{\"pid\":"+p.pid+"}");Console.Out.Flush();
   var stopped=new ManualResetEvent(false);var reader=new Thread(delegate(){try{while(true){string s=Console.ReadLine();if(s==null||s=="stop")break;if(s.StartsWith("duty:")){int v;if(int.TryParse(s.Substring(5),out v)&&v>=5&&v<=90){duty=v;Console.WriteLine("{\"duty\":"+v+"}");Console.Out.Flush();}}}}catch{}stopped.Set();});reader.IsBackground=true;reader.Start();
   // Bound host submission time; already queued GPU work may complete during rest.
   // This is not a driver power limit or a promise of instantaneous GPU utilization.
   var clock=Stopwatch.StartNew();bool paused=false;
   while(!stopped.WaitOne(2)){
    if(WaitForSingleObject(parent,0)==0)break;
    if(WaitForSingleObject(p.process,0)==0){uint code;GetExitCodeProcess(p.process,out code);Console.WriteLine("{\"exitCode\":"+code+"}");break;}
    bool shouldPause=clock.ElapsedMilliseconds%500>=duty*5;
    if(shouldPause!=paused){int result=shouldPause?NtSuspendProcess(p.process):NtResumeProcess(p.process);if(result!=0)throw new Exception("Cannot apply performance budget: "+result);paused=shouldPause;}
   }
   if(paused)NtResumeProcess(p.process);
   return 0;
  }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
  finally{if(job!=IntPtr.Zero)CloseHandle(job);if(p.thread!=IntPtr.Zero)CloseHandle(p.thread);if(p.process!=IntPtr.Zero)CloseHandle(p.process);if(parent!=IntPtr.Zero)CloseHandle(parent);if(output!=IntPtr.Zero&&output!=new IntPtr(-1))CloseHandle(output);if(input!=IntPtr.Zero&&input!=new IntPtr(-1))CloseHandle(input);if(attributesReady)DeleteProcThreadAttributeList(attributes);if(attributes!=IntPtr.Zero)Marshal.FreeHGlobal(attributes);if(handles!=IntPtr.Zero)Marshal.FreeHGlobal(handles);}
 }
}
