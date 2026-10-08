// Windows large-page setup. The elevated entry point can only add one account
// right; it cannot execute commands, edit files, or alter other policies.
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Web.Script.Serialization;
using System.Collections.Generic;

class LargePages {
 const string Right="SeLockMemoryPrivilege";
 [StructLayout(LayoutKind.Sequential)] struct LsaString { public ushort Length,MaximumLength; public IntPtr Buffer; }
 [StructLayout(LayoutKind.Sequential)] struct Attributes { public uint Length; public IntPtr RootDirectory,ObjectName; public uint Flags; public IntPtr SecurityDescriptor,SecurityQualityOfService; }
 [StructLayout(LayoutKind.Sequential)] struct Luid { public uint Low; public int High; }
 [StructLayout(LayoutKind.Sequential)] struct Privilege { public uint Count; public Luid Id; public uint Flags; }
 [DllImport("advapi32.dll")] static extern uint LsaOpenPolicy(IntPtr system,ref Attributes attrs,uint access,out IntPtr handle);
 [DllImport("advapi32.dll")] static extern uint LsaAddAccountRights(IntPtr policy,byte[] sid,LsaString[] rights,uint count);
 [DllImport("advapi32.dll")] static extern uint LsaEnumerateAccountRights(IntPtr policy,byte[] sid,out IntPtr rights,out uint count);
 [DllImport("advapi32.dll")] static extern uint LsaNtStatusToWinError(uint status);
 [DllImport("advapi32.dll")] static extern uint LsaClose(IntPtr handle);
 [DllImport("advapi32.dll")] static extern uint LsaFreeMemory(IntPtr data);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool LookupPrivilegeValue(string system,string name,out Luid value);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool AdjustTokenPrivileges(IntPtr token,bool disable,ref Privilege value,uint length,IntPtr previous,IntPtr returned);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll")] static extern UIntPtr GetLargePageMinimum();
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr VirtualAlloc(IntPtr address,UIntPtr size,uint type,uint protect);
 [DllImport("kernel32.dll")] static extern bool VirtualFree(IntPtr address,UIntPtr size,uint type);
 static byte[] SidBytes(string text){var sid=new SecurityIdentifier(text);if(!sid.IsAccountSid())throw new ArgumentException("An account SID is required");var b=new byte[sid.BinaryLength];sid.GetBinaryForm(b,0);return b;}
 static IntPtr Open(uint access){var a=new Attributes();a.Length=(uint)Marshal.SizeOf(typeof(Attributes));IntPtr h;var e=LsaOpenPolicy(IntPtr.Zero,ref a,access,out h);if(e!=0)throw new Win32Exception((int)LsaNtStatusToWinError(e));return h;}
 static bool? Assigned(string sid){IntPtr p=IntPtr.Zero,list=IntPtr.Zero;try{p=Open(0x800);uint count;var e=LsaEnumerateAccountRights(p,SidBytes(sid),out list,out count);if(LsaNtStatusToWinError(e)==2)return false;if(e!=0)return null;int size=Marshal.SizeOf(typeof(LsaString));for(int i=0;i<count;i++){var s=(LsaString)Marshal.PtrToStructure(IntPtr.Add(list,i*size),typeof(LsaString));if(Marshal.PtrToStringUni(s.Buffer,s.Length/2)==Right)return true;}return false;}catch{return null;}finally{if(list!=IntPtr.Zero)LsaFreeMemory(list);if(p!=IntPtr.Zero)LsaClose(p);}}
 static bool TokenAvailable(){IntPtr token;if(!OpenProcessToken(GetCurrentProcess(),0x28,out token))return false;try{var p=new Privilege();p.Count=1;p.Flags=2;if(!LookupPrivilegeValue(null,Right,out p.Id))return false;return AdjustTokenPrivileges(token,false,ref p,0,IntPtr.Zero,IntPtr.Zero)&&Marshal.GetLastWin32Error()==0;}finally{CloseHandle(token);}}
 static Dictionary<string,object> Status(){string sid=WindowsIdentity.GetCurrent().User.Value;bool token=TokenAvailable(),allocated=false;ulong size=GetLargePageMinimum().ToUInt64();int error=0;if(token&&size>0){var mem=VirtualAlloc(IntPtr.Zero,new UIntPtr(size),0x20003000,4);allocated=mem!=IntPtr.Zero;if(allocated)VirtualFree(mem,UIntPtr.Zero,0x8000);else error=Marshal.GetLastWin32Error();}return new Dictionary<string,object>{{"assigned",Assigned(sid)},{"tokenAvailable",token},{"allocationAvailable",allocated},{"pageBytes",size},{"allocationError",error}};}
 static int Grant(string sid){if(!new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator))return 5;byte[] bytes=SidBytes(sid);IntPtr policy=Open(0x810),buffer=Marshal.StringToHGlobalUni(Right);try{var s=new LsaString{Buffer=buffer,Length=(ushort)(Right.Length*2),MaximumLength=(ushort)((Right.Length+1)*2)};return (int)LsaNtStatusToWinError(LsaAddAccountRights(policy,bytes,new[]{s},1));}finally{Marshal.FreeHGlobal(buffer);LsaClose(policy);}}
 static void Print(object value){Console.WriteLine(new JavaScriptSerializer().Serialize(value));}
 static int Main(string[] args){try{
  if(args.Length==2&&args[0]=="--grant")return Grant(args[1]);
  if(args.Length!=1||(args[0]!="--status"&&args[0]!="--request"))return 87;
  if(args[0]=="--request"){
   // Capture the ORIGINAL account before UAC, even if another administrator
   // supplies credentials in the consent prompt. Never grant Everyone a right.
   string sid=WindowsIdentity.GetCurrent().User.Value;SidBytes(sid);
   try{var start=new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"--grant "+sid){UseShellExecute=true,Verb="runas",WindowStyle=ProcessWindowStyle.Hidden};using(var child=Process.Start(start)){child.WaitForExit();if(child.ExitCode!=0){Print(new{ok=false,errorCode=child.ExitCode});return 1;}}}catch(Win32Exception e){Print(new{ok=false,cancelled=e.NativeErrorCode==1223,errorCode=e.NativeErrorCode});return 1;}
  }
  var result=Status();result["ok"]=true;result["granted"]=args[0]=="--request";Print(result);return 0;
 }catch(Exception e){Print(new{ok=false,error=e.Message});return 1;}}
}
