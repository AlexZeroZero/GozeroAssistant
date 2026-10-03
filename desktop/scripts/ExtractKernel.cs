// Fixed-name, bounded ZIP extraction. Does not execute a shell or the miner.
using System;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
class ExtractKernel {
 sealed class Failure : Exception { public string Code; public Failure(string code){Code=code;} }
 static string Digest(string file){using(var stream=File.OpenRead(file))using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();}
 static void CheckDirectory(string directory){var current=new DirectoryInfo(directory);while(current!=null){if(current.Exists&&(current.Attributes&FileAttributes.ReparsePoint)!=0)throw new Failure("UNSAFE_PATH");current=current.Parent;}}
 static int Main(string[] args){
  string temporary=null;
  try{
   if(args.Length!=3||!Regex.IsMatch(args[2],"^[a-f0-9]{64}$"))throw new Failure("INVALID_ARGUMENTS");
   string archive=Path.GetFullPath(args[0]),directory=Path.GetFullPath(args[1]);
   CheckDirectory(directory);Directory.CreateDirectory(directory);
   string target=Path.Combine(directory,"krig-miner.exe");
   if(File.Exists(target)&&(File.GetAttributes(target)&FileAttributes.ReparsePoint)!=0)throw new Failure("UNSAFE_PATH");
   using(var zip=ZipFile.OpenRead(archive)){
    if(zip.Entries.Count>30)throw new Failure("INVALID_ARCHIVE");
    ZipArchiveEntry selected=null;
    foreach(var entry in zip.Entries){
     // Only root files are expected in the pinned distribution. Batch files are never extracted.
     if(entry.FullName.IndexOfAny(new char[]{'/','\\',':'})>=0||entry.FullName=="..")throw new Failure("UNSAFE_PATH");
     if(entry.FullName=="krig-miner.exe"){if(selected!=null)throw new Failure("INVALID_ARCHIVE");selected=entry;}
    }
    if(selected==null)throw new Failure("MISSING_KERNEL");
    if(selected.Length<=0||selected.Length>600L*1024*1024)throw new Failure("INVALID_ARCHIVE");
    temporary=Path.Combine(directory,".krig-"+Guid.NewGuid().ToString("N")+".tmp");
    using(var input=selected.Open())using(var output=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)){
     byte[] buffer=new byte[65536];long written=0;int count;
     while((count=input.Read(buffer,0,buffer.Length))>0){written+=count;if(written>selected.Length||written>600L*1024*1024)throw new Failure("INVALID_ARCHIVE");output.Write(buffer,0,count);}
     if(written!=selected.Length)throw new Failure("INVALID_ARCHIVE");
     output.Flush(true);
    }
   }
   if(Digest(temporary)!=args[2])throw new Failure("HASH_MISMATCH");
   if(File.Exists(target))File.Replace(temporary,target,null);else File.Move(temporary,target);
   temporary=null;Console.WriteLine("{\"ok\":true}");return 0;
  }catch(Failure e){Console.WriteLine("{\"ok\":false,\"code\":\""+e.Code+"\"}");return 1;}
  catch(UnauthorizedAccessException){Console.WriteLine("{\"ok\":false,\"code\":\"ACCESS_DENIED\"}");return 1;}
  catch(InvalidDataException){Console.WriteLine("{\"ok\":false,\"code\":\"INVALID_ARCHIVE\"}");return 1;}
  catch(IOException){Console.WriteLine("{\"ok\":false,\"code\":\"IO_ERROR\"}");return 1;}
  catch(Exception){Console.WriteLine("{\"ok\":false,\"code\":\"EXTRACT_FAILED\"}");return 1;}
  finally{if(temporary!=null)try{File.Delete(temporary);}catch{}}
 }
}
