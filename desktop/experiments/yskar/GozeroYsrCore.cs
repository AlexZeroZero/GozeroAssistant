// MIT. Gozero HTTP pool host for YSKAR's open SHA-256d kernel.
// No automatic mining; --mine, public wallet and explicit node required.
using System;
using System.IO;
using System.Net;
using System.Text;
using System.Linq;
using System.Threading;
using System.Diagnostics;
using System.Globalization;
using System.Numerics;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

class GozeroYsrCore {
 [DllImport("nvcuda.dll")] static extern int cuInit(uint flags);
 [DllImport("nvcuda.dll")] static extern int cuDeviceGet(out int dev,int ordinal);
 [DllImport("nvcuda.dll")] static extern int cuDeviceGetCount(out int count);
 [DllImport("nvcuda.dll")] static extern int cuDeviceGetUuid(byte[] uuid,int dev);
 [DllImport("nvcuda.dll")] static extern int cuDeviceGetName(StringBuilder name,int size,int dev);
 [DllImport("nvcuda.dll")] static extern int cuDeviceGetAttribute(out int value,int attribute,int dev);
 [DllImport("nvcuda.dll")] static extern int cuDevicePrimaryCtxRetain(out IntPtr ctx,int dev);
 [DllImport("nvcuda.dll")] static extern int cuDevicePrimaryCtxRelease(int dev);
 [DllImport("nvcuda.dll")] static extern int cuCtxSetCurrent(IntPtr ctx);
 [DllImport("nvcuda.dll")] static extern int cuCtxSynchronize();
 [DllImport("nvcuda.dll")] static extern int cuModuleLoadDataEx(out IntPtr m,byte[] data,uint n,IntPtr opts,IntPtr values);
 [DllImport("nvcuda.dll")] static extern int cuModuleGetFunction(out IntPtr f,IntPtr m,string name);
 [DllImport("nvcuda.dll")] static extern int cuFuncGetAttribute(out int value,int attribute,IntPtr function);
 [DllImport("nvcuda.dll")] static extern int cuModuleGetGlobal_v2(out ulong p,out UIntPtr bytes,IntPtr m,string name);
 [DllImport("nvcuda.dll")] static extern int cuModuleUnload(IntPtr m);
 [DllImport("nvcuda.dll")] static extern int cuMemAlloc_v2(out ulong p,UIntPtr n);
 [DllImport("nvcuda.dll")] static extern int cuMemFree_v2(ulong p);
 [DllImport("nvcuda.dll")] static extern int cuMemcpyHtoD_v2(ulong p,byte[] data,UIntPtr n);
 [DllImport("nvcuda.dll")] static extern int cuMemcpyDtoH_v2(byte[] data,ulong p,UIntPtr n);
 [DllImport("nvcuda.dll")] static extern int cuMemsetD32Async(ulong p,uint value,UIntPtr count,IntPtr stream);
 [DllImport("nvcuda.dll")] static extern int cuLaunchKernel(IntPtr f,uint gx,uint gy,uint gz,uint bx,uint by,uint bz,uint mem,IntPtr stream,IntPtr[] args,IntPtr extra);
 static readonly object apiLock=new object(),outputLock=new object();
 static readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=1024*1024,RecursionLimit=32};
 static volatile bool stopping=false;
 class Session {public string Id,Extra,Url;}
 class Job {public Session Session;public string Id,Key;public byte[] Header,Target;public long At;}
 class Share {public Job Job;public ulong Nonce;}
 static volatile Session session;static volatile Job current;
 static BlockingCollection<Share> shares=new BlockingCollection<Share>(16);
 static long accepted,rejected,stale,expired,retargeted,overflows,submitErrors;static string wallet,worker,stopFile;static string[] nodes;
 static int nodeIndex,failures;static long lastPoll;static int pollNow;
 static Stopwatch clock=Stopwatch.StartNew();static long Now{get{return clock.ElapsedMilliseconds;}}
 static void Log(string text){lock(outputLock)Console.WriteLine(DateTime.UtcNow.ToString("HH:mm:ss",CultureInfo.InvariantCulture)+" "+text);}
 static void Check(int code){if(code!=0)throw new Exception("CUDA error "+code);}
 static string S(Dictionary<string,object> d,string key){object v;return d.TryGetValue(key,out v)?Convert.ToString(v,CultureInfo.InvariantCulture):"";}
 static byte[] Hex(string s,int length){if(s==null||s.Length!=length*2)throw new Exception("Invalid hex length");byte[] b=new byte[length];for(int i=0;i<length;i++)b[i]=byte.Parse(s.Substring(i*2,2),NumberStyles.HexNumber,CultureInfo.InvariantCulture);return b;}
 static string Hex(byte[] b){return BitConverter.ToString(b).Replace("-","").ToLowerInvariant();}
 static ulong UInt(string s){ulong n;if(!ulong.TryParse(s,NumberStyles.None,CultureInfo.InvariantCulture,out n))throw new Exception("Invalid unsigned integer");return n;}
 static byte[] Header(Dictionary<string,object> d,string extra){var b=new byte[136];using(var stream=new MemoryStream(b))using(var w=new BinaryWriter(stream)){
  w.Write(checked((uint)UInt(S(d,"version")==""?"1":S(d,"version"))));w.Write(checked((uint)UInt(S(d,"height"))));
  foreach(string k in new[]{"prevHash","merkleRoot","stateRoot"})w.Write(Hex(S(d,k),32));
  w.Write(UInt(S(d,"timestamp")));w.Write(checked((uint)UInt(S(d,"difficulty"))));w.Write(checked((uint)UInt(S(d,"txCount"))));w.Write(UInt(extra));w.Write(0UL);
 }return b;}
 static bool Wallet(string s){if(s==null||s.Length!=42||!s.StartsWith("ysr1")||s!=s.ToLowerInvariant())return false;string chars="qpzry9x8gf2tvdw0s3jn54khce6mua7l";uint chk=1;uint[] gen={0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3};var data=new List<int>{3,3,3,0,25,19,18};foreach(char c in s.Substring(4)){int v=chars.IndexOf(c);if(v<0)return false;data.Add(v);}foreach(int v in data){uint top=chk>>25;chk=((chk&0x1ffffff)<<5)^(uint)v;for(int i=0;i<5;i++)if(((top>>i)&1)!=0)chk^=gen[i];}return chk==0x2bc830a3;}
 static string ApiOrigin(string value){Uri u;if(!Uri.TryCreate(value,UriKind.Absolute,out u)||!(u.Scheme=="https"||u.Scheme=="http"&&u.IsLoopback)||u.UserInfo!=""||u.AbsolutePath!="/"||u.Query!=""||u.Fragment!="")throw new Exception("Expected HTTPS node origin (HTTP only for loopback)");return u.GetLeftPart(UriPartial.Authority);}
 static Dictionary<string,object> Api(string url,string route,object body){
  var req=(HttpWebRequest)WebRequest.Create(url+"/api/v2"+route);req.Method=body==null?"GET":"POST";req.Timeout=6000;req.ReadWriteTimeout=6000;req.AllowAutoRedirect=false;req.UserAgent="GozeroAssistant-YSR/0.1.3";
  if(body!=null){var bytes=Encoding.UTF8.GetBytes(json.Serialize(body));req.ContentType="application/json";req.ContentLength=bytes.Length;using(var s=req.GetRequestStream())s.Write(bytes,0,bytes.Length);}
  using(var response=(HttpWebResponse)req.GetResponse())using(var s=response.GetResponseStream())using(var b=new MemoryStream()){
   byte[] chunk=new byte[8192];int n;while((n=s.Read(chunk,0,chunk.Length))>0){if(b.Length+n>1024*1024)throw new Exception("Response too large");b.Write(chunk,0,n);}
   var d=json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(b.ToArray()));if(d==null)throw new Exception("Invalid node response");return d;
  }
 }
 static void CloseSession(Session s){if(s==null)return;try{Api(s.Url,"/session/stop",new{sessionId=s.Id});}catch(Exception e){Log("Session close unavailable: "+e.Message);}}
 static void Poll(){while(!stopping){if(Interlocked.Exchange(ref pollNow,0)==0&&Now-lastPoll<1500){Thread.Sleep(100);continue;}lastPoll=Now;lock(apiLock){if(stopping)break;try{
   if(session==null){var r=Api(nodes[nodeIndex],"/session",new{address=wallet,platform="desktop/win32-gozero",mode="pool"});if(S(r,"error")!=""||S(r,"sessionId")==""||S(r,"address")!=wallet||S(r,"mode")!="pool")throw new Exception("Session rejected: "+S(r,"error"));UInt(S(r,"extranonce"));session=new Session{Id=S(r,"sessionId"),Extra=S(r,"extranonce"),Url=nodes[nodeIndex]};Log("YSR pool session authorized · "+session.Url);}
   var s=session;var d=Api(s.Url,"/job?session="+Uri.EscapeDataString(s.Id),null);
   if(S(d,"error")!=""){if(S(d,"error")=="session_inactive"){session=null;current=null;}throw new Exception("Job rejected: "+S(d,"error"));}
   string id=S(d,"jobId");if(id==""||id.Length>160)throw new Exception("Invalid job ID");byte[] header=Header(d,s.Extra),target=Hex(S(d,"target"),32);if(target.All(x=>x==0))throw new Exception("Zero share target");
   current=new Job{Session=s,Id=id,Key=s.Id+":"+id+":"+Hex(header),Header=header,Target=target,At=Now};failures=0;
  }catch(Exception e){current=null;Log("YSR connection paused: "+e.Message);if(++failures>=3){CloseSession(session);session=null;nodeIndex=(nodeIndex+1)%nodes.Length;failures=0;}lastPoll=Now+1500;}}}}
 static byte[] Target(string difficulty){BigInteger d;if(!BigInteger.TryParse(difficulty,NumberStyles.None,CultureInfo.InvariantCulture,out d)||d<=0||d>(BigInteger.One<<240))throw new Exception("Invalid share difficulty");var le=((BigInteger.One<<240)/d).ToByteArray();var b=new byte[32];for(int i=0;i<Math.Min(32,le.Length);i++)b[31-i]=le[i];return b;}
 static void Discard(bool oldJob){Interlocked.Increment(ref stale);if(oldJob)Interlocked.Increment(ref expired);else Interlocked.Increment(ref retargeted);}
 static string ShareStats(){return " accepted="+accepted+" rejected="+rejected+" stale="+stale+" expired="+expired+" retargeted="+retargeted+" overflowRetries="+overflows+" submitErrors="+submitErrors;}
 static void Submit(){while(!stopping){Share item;if(!shares.TryTake(out item,100))continue;lock(apiLock){if(stopping)break;var j=current;if(j==null||j.Key!=item.Job.Key||session!=item.Job.Session){Discard(true);continue;}if(!Below(Hash(j.Header,item.Nonce),j.Target)){Discard(false);continue;}try{
   var r=Api(j.Session.Url,"/share",new{sessionId=j.Session.Id,jobId=j.Id,nonce=item.Nonce.ToString(CultureInfo.InvariantCulture)});
   object yes;bool ok=r.TryGetValue("accepted",out yes)&&yes is bool&&(bool)yes;if(ok){Interlocked.Increment(ref accepted);Log("YSR share accepted · "+accepted);if(S(r,"shareDifficulty")!="")current=new Job{Session=j.Session,Id=j.Id,Key=j.Key,Header=j.Header,Target=Target(S(r,"shareDifficulty")),At=j.At};if(S(r,"block")=="True"){Log("YSR block accepted · height "+S(r,"height"));current=null;Interlocked.Exchange(ref pollNow,1);}}
   else{string reason=S(r,"reason");Interlocked.Increment(ref rejected);Log("YSR share rejected: "+reason);if(reason=="session_inactive"){session=null;current=null;}if(reason=="job_expired"||reason=="stale_job"||reason=="job_unknown")current=null;Interlocked.Exchange(ref pollNow,1);}
  }catch(Exception e){Interlocked.Increment(ref submitErrors);Log("YSR share submit failed (not counted accepted): "+e.Message);current=null;Interlocked.Exchange(ref pollNow,1);}}}}
 static byte[] Hash(byte[] header,ulong nonce){byte[] h=(byte[])header.Clone();Array.Copy(BitConverter.GetBytes(nonce),0,h,128,8);using(var sha=SHA256.Create())return sha.ComputeHash(sha.ComputeHash(h));}
 static bool Below(byte[] a,byte[] b){for(int i=0;i<32;i++){if(a[i]<b[i])return true;if(a[i]>b[i])return false;}return true;}
 static IntPtr Arg(ulong value){IntPtr p=Marshal.AllocHGlobal(8);Marshal.WriteInt64(p,unchecked((long)value));return p;}
 static IntPtr Arg(uint value){IntPtr p=Marshal.AllocHGlobal(4);Marshal.WriteInt32(p,unchecked((int)value));return p;}
 static IntPtr searchFunction;static uint searchBlocks=1,searchThreads=128;
 static void Launch(IntPtr f,uint count,params IntPtr[] args){try{uint threads=f==searchFunction?searchThreads:128,blocks=f==searchFunction?Math.Min(searchBlocks,(count+threads-1)/threads):(count+127)/128;Check(cuLaunchKernel(f,blocks,1,1,threads,1,1,0,IntPtr.Zero,args,IntPtr.Zero));Check(cuCtxSynchronize());}finally{foreach(var p in args)Marshal.FreeHGlobal(p);}}
 static ulong Symbol(IntPtr module,string name,int expected){ulong p;UIntPtr size;Check(cuModuleGetGlobal_v2(out p,out size,module,name));if(size.ToUInt64()!=(ulong)expected)throw new Exception("CUDA constant size mismatch");return p;}
 static void Upload(ulong ptr,byte[] data){Check(cuMemcpyHtoD_v2(ptr,data,(UIntPtr)data.Length));}
 static byte[] Read(ulong ptr,int n){byte[] b=new byte[n];Check(cuMemcpyDtoH_v2(b,ptr,(UIntPtr)n));return b;}
 // Reuse host argument storage. The blocking result copy is the single completion
 // fence: a batch is never counted before all its GPU work has finished.
 sealed class SearchBatch:IDisposable {
  readonly IntPtr[] args;readonly ulong found;readonly byte[] result=new byte[4];
  public SearchBatch(ulong mid,ulong target,ulong counter,ulong nonces){found=counter;args=new[]{Arg(mid),Arg(target),Arg(0UL),Arg(0u),Arg(counter),Arg(nonces)};}
  public uint Run(IntPtr kernel,ulong start,uint count){
   Marshal.WriteInt64(args[2],unchecked((long)start));Marshal.WriteInt32(args[3],unchecked((int)count));
   Check(cuMemsetD32Async(found,0,(UIntPtr)1,IntPtr.Zero));
   uint blocks=Math.Min(searchBlocks,(count+searchThreads-1)/searchThreads);
   Check(cuLaunchKernel(kernel,blocks,1,1,searchThreads,1,1,0,IntPtr.Zero,args,IntPtr.Zero));
   Check(cuMemcpyDtoH_v2(result,found,(UIntPtr)4));return BitConverter.ToUInt32(result,0);
  }
  public void Dispose(){foreach(var p in args)Marshal.FreeHGlobal(p);}
 }
 sealed class LaunchChoice {public IntPtr Kernel;public uint Threads,Blocks;public double Ms;}
 static double Measure(SearchBatch runner,LaunchChoice choice,uint count,int repeats){
  searchThreads=choice.Threads;searchBlocks=choice.Blocks;var times=new double[repeats];
  runner.Run(choice.Kernel,0,count);
  for(int pass=0;pass<repeats;pass++){if(stopFile!=null&&File.Exists(stopFile))throw new OperationCanceledException("Stopped during GPU calibration");var watch=Stopwatch.StartNew();runner.Run(choice.Kernel,(ulong)pass*count,count);times[pass]=watch.Elapsed.TotalMilliseconds;}
  Array.Sort(times);return times[repeats/2];
 }
 static int Main(string[] argv){Console.OutputEncoding=new UTF8Encoding(false);Thread.CurrentThread.CurrentCulture=CultureInfo.InvariantCulture;ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;ServicePointManager.DefaultConnectionLimit=8;
  var opts=new Dictionary<string,string>();var urls=new List<string>();bool mine=false,self=false;int device=0;IntPtr ctx=IntPtr.Zero,module=IntPtr.Zero;var memory=new List<ulong>();Thread polling=null,submitting=null;SearchBatch runner=null;
  try{for(int i=0;i<argv.Length;i++){string key=argv[i];if(key=="--mine"){mine=true;continue;}if(key=="--selftest"){self=true;continue;}if(!new[]{"--wallet","--api","--backup","--device","--seconds","--stop-file","--worker"}.Contains(key)||i+1==argv.Length)throw new Exception("Unknown/incomplete argument "+key);string value=argv[++i];if(key=="--api"||key=="--backup")urls.Add(ApiOrigin(value));else opts[key]=value;}
   if(!mine&&!self){Log("Gozero YSR 0.1.3 · use --selftest or --mine --api HTTPS_ORIGIN --wallet ysr1...");return 0;}if(mine&&self)throw new Exception("Choose mining OR selftest");
   if(mine){wallet=opts.ContainsKey("--wallet")?opts["--wallet"]:"";if(!Wallet(wallet)||urls.Count<1)throw new Exception("Valid YSR wallet and explicit pool required");nodes=urls.Distinct().ToArray();if(nodes.Length>3)throw new Exception("At most 3 pool nodes");}
   worker=opts.ContainsKey("--worker")?opts["--worker"]:"Gozero";stopFile=opts.ContainsKey("--stop-file")?opts["--stop-file"]:null;
   int seconds=opts.ContainsKey("--seconds")?checked((int)UInt(opts["--seconds"])):0;if(seconds<0||seconds>3600)throw new Exception("Bounded run maximum 3600 seconds");
   Check(cuInit(0));Check(cuDeviceGet(out device,opts.ContainsKey("--device")?checked((int)UInt(opts["--device"])):0));
   // The Driver API must explicitly resolve the UUID; CUDA_VISIBLE_DEVICES alone
   // is a Runtime API convention and must not select a different physical GPU.
   string selectedUuid=Environment.GetEnvironmentVariable("CUDA_VISIBLE_DEVICES");
   if(!String.IsNullOrEmpty(selectedUuid)){
    if(!selectedUuid.StartsWith("GPU-",StringComparison.OrdinalIgnoreCase))throw new Exception("Expected one explicit GPU UUID");
    string expected=selectedUuid.Substring(4).Replace("-","").ToLowerInvariant();Hex(expected,16);
    int total;Check(cuDeviceGetCount(out total));bool matched=false;
    for(int index=0;index<total;index++){int candidate;Check(cuDeviceGet(out candidate,index));byte[] uuid=new byte[16];Check(cuDeviceGetUuid(uuid,candidate));if(Hex(uuid)==expected){device=candidate;matched=true;break;}}
    if(!matched)throw new Exception("Selected GPU UUID is unavailable");
   }
   int major;Check(cuDeviceGetAttribute(out major,75,device));if(major<8)throw new Exception("This build requires NVIDIA SM 8.0+ (RTX 30 or newer)");
   Check(cuDevicePrimaryCtxRetain(out ctx,device));Check(cuCtxSetCurrent(ctx));var name=new StringBuilder(128);Check(cuDeviceGetName(name,128,device));Log("Gozero YSR 0.1.3 · "+name);
   string ptx=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"ysr.ptx");Check(cuModuleLoadDataEx(out module,File.ReadAllBytes(ptx),0,IntPtr.Zero,IntPtr.Zero));
   IntPtr prepare,hash,search,fastSearch,referenceSearch;Check(cuModuleGetFunction(out prepare,module,"ysr_prepare"));Check(cuModuleGetFunction(out hash,module,"ysr_hash"));Check(cuModuleGetFunction(out fastSearch,module,"ysr_search"));Check(cuModuleGetFunction(out referenceSearch,module,"ysr_search_reference"));search=fastSearch;
   int sm;Check(cuDeviceGetAttribute(out sm,16,device));searchBlocks=checked((uint)Math.Max(1,sm*8));searchFunction=search;
   Func<int,ulong> alloc=n=>{ulong p;Check(cuMemAlloc_v2(out p,(UIntPtr)n));memory.Add(p);return p;};ulong input=alloc(136),mid=alloc(32),digest=alloc(32),target=Symbol(module,"ysr_c_target",32),constantMid=Symbol(module,"ysr_c_mid",32),found=alloc(4),nonces=alloc(512);
   runner=new SearchBatch(mid,target,found,nonces);
   var vectors=json.Deserialize<object[]>(File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"selftest.json")));
   foreach(Dictionary<string,object> v in vectors){byte[] h=Hex(S(v,"header"),136);Upload(input,h);Launch(prepare,1,Arg(input),Arg(mid));Launch(hash,1,Arg(mid),Arg(BitConverter.ToUInt64(h,128)),Arg(digest));if(Hex(Read(digest,32))!=S(v,"digest"))throw new Exception("GPU algorithm selftest failed");}
   // Search/target/counter checks exercise the actual mining kernel too.
   Upload(input,new byte[136]);Launch(prepare,1,Arg(input),Arg(mid));Upload(constantMid,Read(mid,32));Upload(target,Enumerable.Repeat((byte)255,32).ToArray());Upload(found,new byte[4]);Launch(search,8,Arg(mid),Arg(target),Arg(ulong.MaxValue-7),Arg(8u),Arg(found),Arg(nonces));var ns=Read(nonces,64);if(BitConverter.ToUInt32(Read(found,4),0)!=8||Enumerable.Range(0,8).Select(i=>BitConverter.ToUInt64(ns,i*8)).Distinct().Count()!=8)throw new Exception("GPU nonce boundary selftest failed");
   byte[] eq=Hash(new byte[136],0);Upload(target,eq);Upload(found,new byte[4]);Launch(search,1,Arg(mid),Arg(target),Arg(0UL),Arg(1u),Arg(found),Arg(nonces));if(BitConverter.ToUInt32(Read(found,4),0)!=1)throw new Exception("GPU target equality selftest failed");
   // Verify every selectable thread size and both single/multi-block strided
   // tails against the complete CPU candidate set, using the production runner.
   uint normalBlocks=searchBlocks;searchBlocks=1;int candidateSets=0;
   foreach(IntPtr variant in new IntPtr[]{fastSearch,referenceSearch}){search=variant;searchFunction=variant;
   foreach(uint shape in new uint[]{64,128,256,512}){searchThreads=shape;
    foreach(uint grid in new uint[]{1,3}){searchBlocks=grid;
    foreach(Dictionary<string,object> v in (grid==1?vectors:vectors.Take(1).ToArray())){byte[] h=Hex(S(v,"header"),136);ulong start=ulong.MaxValue-1030;byte[] limit=Hash(h,start+13);limit[0]=0;
     Upload(input,h);Launch(prepare,1,Arg(input),Arg(mid));Upload(constantMid,Read(mid,32));Upload(target,limit);
     uint count=runner.Run(search,start,1031);if(count>64)throw new Exception("Selftest result overflow");byte[] actual=Read(nonces,(int)count*8);
     var expected=Enumerable.Range(0,1031).Select(i=>start+(ulong)i).Where(n=>Below(Hash(h,n),limit)).OrderBy(n=>n).ToArray();
     if(!Enumerable.Range(0,(int)count).Select(i=>BitConverter.ToUInt64(actual,i*8)).OrderBy(n=>n).SequenceEqual(expected))throw new Exception("GPU strided candidate selftest failed");candidateSets++;
    }
    }
   }
   Upload(target,Enumerable.Repeat((byte)255,32).ToArray());if(runner.Run(search,0,257)!=257)throw new Exception("GPU variant overflow selftest failed");
   }
   searchBlocks=normalBlocks;
   // Easy-target overflow must count every searched nonce, without writing past
   // the 64-slot result buffer. The mining loop retries a smaller range.
   Upload(target,Enumerable.Repeat((byte)255,32).ToArray());Upload(found,new byte[4]);Launch(search,257,Arg(mid),Arg(target),Arg(0UL),Arg(257u),Arg(found),Arg(nonces));if(BitConverter.ToUInt32(Read(found,4),0)!=257)throw new Exception("GPU overflow count selftest failed");
   Log("GPU selftest PASSED · "+vectors.Length+" hash vectors + "+candidateSets+" strided candidate sets + boundaries");if(self)return 0;
   // Brief, local launch-shape calibration. Zero target produces no submitted
   // shares; these warmup hashes are excluded from reported mining throughput.
   Upload(target,new byte[32]);var choices=new List<LaunchChoice>();
   foreach(IntPtr variant in new IntPtr[]{fastSearch,referenceSearch})foreach(uint shape in new uint[]{64,128,256,512})foreach(uint mult in new uint[]{4,8,16})choices.Add(new LaunchChoice{Kernel=variant,Threads=shape,Blocks=(uint)sm*mult});
   var baseline=choices.First(c=>c.Kernel==fastSearch&&c.Threads==128&&c.Blocks==(uint)sm*8);
   for(int warm=0;warm<8;warm++)Measure(runner,baseline,16777216,1);
   // Median samples, then a reverse-order finalist pass prevent choosing a
   // transient fastest launch. A near tie keeps the known baseline topology.
   foreach(var choice in choices)choice.Ms=Measure(runner,choice,16777216,3);
   var finalists=choices.OrderBy(c=>c.Ms).Take(3).ToList();var baselines=choices.Where(c=>(c.Threads==128||c.Threads==256)&&c.Blocks==(uint)sm*8).ToList();foreach(var known in baselines)if(!finalists.Contains(known))finalists.Add(known);
   foreach(var choice in finalists.AsEnumerable().Reverse())choice.Ms=Measure(runner,choice,33554432,5);
   baseline=baselines.OrderBy(c=>c.Ms).First();
   var chosen=finalists.OrderBy(c=>c.Ms).First();if(chosen.Ms>=baseline.Ms*0.98)chosen=baseline;
   search=chosen.Kernel;searchFunction=search;searchThreads=chosen.Threads;searchBlocks=chosen.Blocks;int registers,localBytes;Check(cuFuncGetAttribute(out registers,4,search));Check(cuFuncGetAttribute(out localBytes,3,search));Log("CUDA launch · variant="+(search==fastSearch?"rolling16":"reference")+" SM="+sm+" threads="+searchThreads+" blocks="+searchBlocks+" registers="+registers+" localBytes="+localBytes+" adaptive batch target=80ms calibrationMs="+chosen.Ms.ToString("F2")+" baselineMs="+baseline.Ms.ToString("F2"));
   Console.CancelKeyPress+=(o,e)=>{e.Cancel=true;stopping=true;};polling=new Thread(Poll){IsBackground=true};submitting=new Thread(Submit){IsBackground=true};polling.Start();submitting.Start();
   string keyLoaded=null;byte[] targetLoaded=null;ulong nonce=0;uint batch=32768;long begun=Now,rateAt=Now,done=0;bool exhausted=false;
   while(!stopping&&(seconds==0||Now-begun<seconds*1000L)){
    if(stopFile!=null&&File.Exists(stopFile))break;var j=current;long now=Now;
    if(j==null||now-j.At>10000||(exhausted&&j.Key==keyLoaded)){if(now-rateAt>=2000){Log("GPU hashrate "+(done*1000.0/(now-rateAt)).ToString("F2",CultureInfo.InvariantCulture)+" H/s"+ShareStats());rateAt=now;done=0;}Thread.Sleep(50);continue;}
    if(keyLoaded!=j.Key){Upload(input,j.Header);Launch(prepare,1,Arg(input),Arg(mid));Upload(constantMid,Read(mid,32));keyLoaded=j.Key;nonce=0;exhausted=false;}
    uint count=batch;if(ulong.MaxValue-nonce<(ulong)count-1)count=(uint)(ulong.MaxValue-nonce+1);
    if(targetLoaded==null||!j.Target.SequenceEqual(targetLoaded)){Upload(target,j.Target);targetLoaded=j.Target;}
    long t=Now;uint matches=runner.Run(search,nonce,count);long dt=Math.Max(1,Now-t);
    if(matches>64){Interlocked.Increment(ref overflows);if(count<=1)throw new Exception("Candidate buffer overflow");batch=Math.Max(1,count/2);continue;}
    done+=count;if(matches>0){byte[] ns2=Read(nonces,(int)matches*8);for(int i=0;i<matches;i++){ulong n=BitConverter.ToUInt64(ns2,i*8);byte[] checkedHash=Hash(j.Header,n);if(!Below(checkedHash,j.Target))throw new Exception("GPU candidate failed independent CPU verification");while(!stopping){var live=current;if(live==null||live.Key!=j.Key){Discard(true);break;}if(!Below(checkedHash,live.Target)){Discard(false);break;}if(shares.TryAdd(new Share{Job=j,Nonce=n},50))break;if(stopFile!=null&&File.Exists(stopFile)){stopping=true;break;}}}}
    exhausted=ulong.MaxValue-nonce==count-1;nonce+=count;
    double next=Math.Min(count*2.0,count*80.0/dt);if(matches>0)next=Math.Min(next,count*16.0/matches);
    batch=(uint)Math.Max(1024,Math.Min(268435456,next));
    if(Now-rateAt>=2000){Log("GPU hashrate "+(done*1000.0/(Now-rateAt)).ToString("F2",CultureInfo.InvariantCulture)+" H/s"+ShareStats());done=0;rateAt=Now;}
   }
   Log("YSR stopping ·"+ShareStats());return 0;
  }catch(Exception e){Log("ERROR "+e.Message);return 1;}
  finally{stopping=true;current=null;if(polling!=null)polling.Join(7000);if(submitting!=null)submitting.Join(7000);lock(apiLock){CloseSession(session);session=null;}if(runner!=null)runner.Dispose();foreach(ulong p in memory)cuMemFree_v2(p);if(module!=IntPtr.Zero)cuModuleUnload(module);if(ctx!=IntPtr.Zero)cuDevicePrimaryCtxRelease(device);}
 }
}
