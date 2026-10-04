// Extract only the pinned files of an official miner archive; never run its scripts.
using System;
using System.IO;
using System.IO.Compression;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
class ExtractBundle {
 class Plan {public string root {get;set;} public Dictionary<string,string> files {get;set;}}
 class Failure:Exception {public string Code;public Failure(string c){Code=c;}}
 static string Hash(string p){using(var h=SHA256.Create())using(var s=File.OpenRead(p))return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
 static void SafeDirectory(string p){for(var d=new DirectoryInfo(p);d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new Failure("UNSAFE_PATH");}
 static string Relative(string s){s=s.Replace('\\','/');if(s.Length==0||s.Length>240||s.StartsWith("/")||s.Contains(":"))throw new Failure("UNSAFE_PATH");foreach(string piece in s.TrimEnd('/').Split('/'))if(piece=="."||piece==".."||!Regex.IsMatch(piece,"^[A-Za-z0-9_. -]+$")||piece.EndsWith(".")||piece.EndsWith(" "))throw new Failure("UNSAFE_PATH");return s;}
 static int Main(string[] args){string stage=null,directory=null;try{
  if(args.Length!=3)throw new Failure("INVALID_ARGUMENTS");var plan=new JavaScriptSerializer().Deserialize<Plan>(args[2]);
  if(plan==null||plan.files==null||plan.files.Count==0||plan.files.Count>100)throw new Failure("INVALID_ARGUMENTS");string root=plan.root??"";if(root!="")root=Relative(root);
  foreach(var f in plan.files){Relative(f.Key);if(f.Key.EndsWith("/")||!Regex.IsMatch(f.Value,"^[a-f0-9]{64}$"))throw new Failure("INVALID_ARGUMENTS");}
  directory=Path.GetFullPath(args[1]);SafeDirectory(directory);Directory.CreateDirectory(directory);stage=Path.Combine(directory,".bundle-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(stage);
  var found=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
  using(var zip=ZipFile.OpenRead(Path.GetFullPath(args[0]))){if(zip.Entries.Count>150)throw new Failure("INVALID_ARCHIVE");foreach(var entry in zip.Entries){string n=Relative(entry.FullName);if(n.EndsWith("/"))continue;if(!n.StartsWith(root,StringComparison.Ordinal))throw new Failure("INVALID_ARCHIVE");string rel=n.Substring(root.Length);if(!plan.files.ContainsKey(rel))continue;if(!found.Add(rel))throw new Failure("INVALID_ARCHIVE");
   if(entry.Length<=0||entry.Length>600L*1024*1024||(total+=entry.Length)>800L*1024*1024)throw new Failure("INVALID_ARCHIVE");string p=Path.GetFullPath(Path.Combine(stage,rel));if(!p.StartsWith(stage+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Failure("UNSAFE_PATH");Directory.CreateDirectory(Path.GetDirectoryName(p));
   using(var input=entry.Open())using(var output=new FileStream(p,FileMode.CreateNew,FileAccess.Write)){byte[] b=new byte[65536];long written=0;int count;while((count=input.Read(b,0,b.Length))>0){written+=count;if(written>entry.Length)throw new Failure("INVALID_ARCHIVE");output.Write(b,0,count);}if(written!=entry.Length)throw new Failure("INVALID_ARCHIVE");output.Flush(true);}
   if(Hash(p)!=plan.files[rel])throw new Failure("HASH_MISMATCH");
  }}
  if(found.Count!=plan.files.Count)throw new Failure("MISSING_KERNEL");
  foreach(var rel in found){string target=Path.GetFullPath(Path.Combine(directory,rel));if(!target.StartsWith(directory+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Failure("UNSAFE_PATH");SafeDirectory(Path.GetDirectoryName(target));Directory.CreateDirectory(Path.GetDirectoryName(target));if(File.Exists(target)&&(File.GetAttributes(target)&FileAttributes.ReparsePoint)!=0)throw new Failure("UNSAFE_PATH");}
  foreach(var rel in found){string target=Path.Combine(directory,rel),source=Path.Combine(stage,rel);if(File.Exists(target))File.Replace(source,target,null);else File.Move(source,target);}
  Console.WriteLine("{\"ok\":true}");return 0;
 }catch(Failure e){Console.WriteLine("{\"ok\":false,\"code\":\""+e.Code+"\"}");return 1;}
 catch(UnauthorizedAccessException){Console.WriteLine("{\"ok\":false,\"code\":\"ACCESS_DENIED\"}");return 1;}
 catch(InvalidDataException){Console.WriteLine("{\"ok\":false,\"code\":\"INVALID_ARCHIVE\"}");return 1;}
 catch(Exception){Console.WriteLine("{\"ok\":false,\"code\":\"EXTRACT_FAILED\"}");return 1;}
 finally{if(stage!=null&&directory!=null)try{string actual=Path.GetFullPath(stage);if(actual.StartsWith(directory+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)&&Path.GetFileName(actual).StartsWith(".bundle-")){SafeDirectory(actual);Directory.Delete(actual,true);}}catch{}}
 }
}
