using System;
using System.Collections.Generic;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

// Read-only Windows inventory. No PowerShell, script policy changes or external commands.
class Inventory {
    static readonly List<string> Warnings = new List<string>();
    [StructLayout(LayoutKind.Sequential)] struct PropertyKey { public Guid Format; public uint Id; }
    [DllImport("cfgmgr32.dll", CharSet=CharSet.Unicode, EntryPoint="CM_Locate_DevNodeW")]
    static extern uint Locate(out uint node, string id, uint flags);
    [DllImport("cfgmgr32.dll", CharSet=CharSet.Unicode, EntryPoint="CM_Get_DevNode_PropertyW")]
    static extern uint Property(uint node, ref PropertyKey key, out uint type, byte[] data, ref uint length, uint flags);
    static uint? DeviceNumber(uint node, uint id) {
        var key = new PropertyKey { Format=new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), Id=id };
        uint type, length=4; var data=new byte[4];
        return Property(node,ref key,out type,data,ref length,0)==0 && type==7 && length==4 ? (uint?)BitConverter.ToUInt32(data,0) : null;
    }
    static string Pci(string id) {
        try {
            uint node; if(Locate(out node,id,0)!=0)return null;
            var bus=DeviceNumber(node,23); var address=DeviceNumber(node,30);
            if(!bus.HasValue||!address.HasValue)return null;
            var device=address.Value>>16; var function=address.Value&0xffff;
            if(device>31||function>7)return null;
            return bus.Value.ToString("x2")+":"+device.ToString("x2")+"."+function.ToString("x1");
        } catch { return null; }
    }
    static List<Dictionary<string,object>> Read(string name, params string[] fields) {
        var rows=new List<Dictionary<string,object>>();
        try {
            var options=new EnumerationOptions { Timeout=TimeSpan.FromSeconds(8), ReturnImmediately=true, Rewindable=false };
            using(var search=new ManagementObjectSearcher(new ManagementScope("root\\cimv2"),new ObjectQuery("SELECT "+String.Join(",",fields)+" FROM "+name),options))
            using(var results=search.Get()) {
                foreach(ManagementObject item in results) using(item) {
                    if(rows.Count>=256){Warnings.Add(name+" truncated");break;}
                    var row=new Dictionary<string,object>();
                    foreach(string field in fields) { try{row[field]=item[field];}catch{row[field]=null;} }
                    rows.Add(row);
                }
            }
        } catch { Warnings.Add(name+" unavailable"); }
        return rows;
    }
    static int Main(string[] args) {
        Console.OutputEncoding=new UTF8Encoding(false);
        if(args.Length!=0){Console.Error.WriteLine("INVENTORY_ARGUMENTS");return 2;}
        try {
            var result=new Dictionary<string,object>();
            result["cpu"]=Read("Win32_Processor","Name","Manufacturer","NumberOfCores","NumberOfLogicalProcessors","L2CacheSize","L3CacheSize","CurrentClockSpeed","MaxClockSpeed","SocketDesignation","Architecture","AddressWidth");
            result["memory"]=Read("Win32_PhysicalMemory","DeviceLocator","BankLabel","Capacity","Manufacturer","PartNumber","ConfiguredClockSpeed","Speed","SMBIOSMemoryType","DataWidth","TotalWidth");
            result["board"]=Read("Win32_BaseBoard","Manufacturer","Product","Version");
            result["bios"]=Read("Win32_BIOS","SMBIOSBIOSVersion","Manufacturer");
            result["os"]=Read("Win32_OperatingSystem","Caption","Version","BuildNumber","TotalVisibleMemorySize");
            result["cache"]=Read("Win32_CacheMemory","Level","InstalledSize","Purpose");
            var gpus=new List<Dictionary<string,object>>();
            foreach(var gpu in Read("Win32_VideoController","Name","PNPDeviceID","DriverVersion","Status","VideoProcessor")) {
                string pnp=Convert.ToString(gpu["PNPDeviceID"]);
                if(!pnp.StartsWith("PCI\\",StringComparison.OrdinalIgnoreCase))continue;
                gpus.Add(new Dictionary<string,object>{{"name",gpu["Name"]},{"pnp",pnp},{"driver",gpu["DriverVersion"]},{"pci",Pci(pnp)},{"status",gpu["Status"]},{"processor",gpu["VideoProcessor"]}});
            }
            result["gpus"]=gpus; result["warnings"]=Warnings;
            if(((List<Dictionary<string,object>>)result["cpu"]).Count==0 && ((List<Dictionary<string,object>>)result["memory"]).Count==0 && gpus.Count==0) {
                Console.Error.WriteLine("INVENTORY_UNAVAILABLE");return 3;
            }
            Console.WriteLine(new JavaScriptSerializer{MaxJsonLength=2*1024*1024}.Serialize(result));return 0;
        } catch { Console.Error.WriteLine("INVENTORY_FAILED");return 4; }
    }
}
