// Small DDC/CI helper for the Deck Toolkit Stream Deck plugin.
// Usage:
//   ddc.exe list
//   ddc.exe get <id | \\.\DISPLAYn> <physicalIndex> <vcpHex>
//   ddc.exe set <id | \\.\DISPLAYn> <physicalIndex> <vcpHex> <value> [retries]
// <id> is the stable monitor id printed by "list" (model#connector), e.g. HKC2729#5&1ca07395&0&UID4355.
// Output is JSON on stdout. Exit code 0 = success.
using System;
using System.Collections.Generic;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class Ddc
{
    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int left, top, right, bottom; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct MONITORINFOEX
    {
        public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szDevice;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PHYSICAL_MONITOR
    {
        public IntPtr hPhysicalMonitor;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szPhysicalMonitorDescription;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct DISPLAY_DEVICE
    {
        public int cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
        public int StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
    }

    delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdc, ref RECT rect, IntPtr data);

    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc proc, IntPtr data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX info);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplayDevices(string device, uint devNum, ref DISPLAY_DEVICE dd, uint flags);
    [DllImport("dxva2.dll")] static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, out uint count);
    [DllImport("dxva2.dll")] static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint count, [Out] PHYSICAL_MONITOR[] monitors);
    [DllImport("dxva2.dll")] static extern bool DestroyPhysicalMonitors(uint count, PHYSICAL_MONITOR[] monitors);
    [DllImport("dxva2.dll")] static extern bool SetVCPFeature(IntPtr hMonitor, byte code, uint value);
    [DllImport("dxva2.dll")] static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr hMonitor, byte code, IntPtr type, out uint current, out uint max);

    // Id = stable key "HKC2729#5&1ca07395&0&UID4355" (model + GPU connector). Unlike \\.\DISPLAYn
    // it survives reboots, and it tells identical monitors apart (they may share one EDID serial).
    class Mon { public string Device; public int Index; public string Name; public string Id; public RECT Rect; public IntPtr Handle; }

    static string StableId(string deviceId)
    {
        if (string.IsNullOrEmpty(deviceId)) return null;
        var p = deviceId.Split('#');
        return p.Length < 3 ? null : p[1] + "#" + p[2];
    }

    static List<IntPtr> HMonitors()
    {
        var list = new List<IntPtr>();
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr h, IntPtr dc, ref RECT r, IntPtr d) => { list.Add(h); return true; }, IntPtr.Zero);
        return list;
    }

    static Dictionary<string, string> FriendlyNames()
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using (var s = new ManagementObjectSearcher(@"root\wmi", "SELECT InstanceName, UserFriendlyName FROM WmiMonitorID"))
                foreach (ManagementObject o in s.Get())
                {
                    var chars = o["UserFriendlyName"] as ushort[];
                    var sb = new StringBuilder();
                    if (chars != null) foreach (var c in chars) { if (c == 0) break; sb.Append((char)c); }
                    map[(string)o["InstanceName"]] = sb.ToString();
                }
        }
        catch { }
        return map;
    }

    // Maps "\\?\DISPLAY#MSI3FA7#5&abc&0&UID4353#{guid}" to the WMI friendly name.
    static string LookupName(string deviceId, Dictionary<string, string> names)
    {
        if (string.IsNullOrEmpty(deviceId)) return null;
        var p = deviceId.Split('#');
        if (p.Length < 3) return null;
        var prefix = "DISPLAY\\" + p[1] + "\\" + p[2];
        foreach (var kv in names)
            if (kv.Key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && kv.Value.Length > 0) return kv.Value;
        return null;
    }

    // Opens every physical monitor. Caller must call Close().
    static List<Mon> Open(List<PHYSICAL_MONITOR[]> toFree, bool withNames)
    {
        var names = withNames ? FriendlyNames() : new Dictionary<string, string>();
        var result = new List<Mon>();
        foreach (var h in HMonitors())
        {
            var info = new MONITORINFOEX(); info.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
            if (!GetMonitorInfo(h, ref info)) continue;
            uint n;
            if (!GetNumberOfPhysicalMonitorsFromHMONITOR(h, out n) || n == 0) continue;
            var arr = new PHYSICAL_MONITOR[n];
            if (!GetPhysicalMonitorsFromHMONITOR(h, n, arr)) continue;
            toFree.Add(arr);
            for (int i = 0; i < n; i++)
            {
                string name = null, id = null;
                var dd = new DISPLAY_DEVICE(); dd.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
                if (EnumDisplayDevices(info.szDevice, (uint)i, ref dd, 1))
                {
                    id = StableId(dd.DeviceID);
                    if (withNames) name = LookupName(dd.DeviceID, names);
                }
                result.Add(new Mon { Device = info.szDevice, Index = i, Handle = arr[i].hPhysicalMonitor, Id = id, Rect = info.rcMonitor, Name = name ?? arr[i].szPhysicalMonitorDescription });
            }
        }
        return result;
    }

    static void Close(List<PHYSICAL_MONITOR[]> toFree) { foreach (var a in toFree) DestroyPhysicalMonitors((uint)a.Length, a); }

    static string J(string s)
    {
        if (s == null) return "null";
        var sb = new StringBuilder("\"");
        foreach (var c in s)
        {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c < 0x20) sb.AppendFormat("\\u{0:x4}", (int)c);
            else sb.Append(c);
        }
        return sb.Append('"').ToString();
    }

    // "device" is either a stable Id (preferred) or a legacy \\.\DISPLAYn name plus physical index.
    static Mon Find(List<Mon> mons, string device, int index)
    {
        if (!device.StartsWith(@"\\.\"))
        {
            foreach (var m in mons) if (string.Equals(m.Id, device, StringComparison.OrdinalIgnoreCase)) return m;
            return null;
        }
        foreach (var m in mons) if (string.Equals(m.Device, device, StringComparison.OrdinalIgnoreCase) && m.Index == index) return m;
        return null;
    }

    static int Fail(string msg) { Console.WriteLine("{\"ok\":false,\"error\":" + J(msg) + "}"); return 1; }

    static int Main(string[] args)
    {
        if (args.Length == 0) return Fail("usage: list | get <device> <index> <vcp> | set <device> <index> <vcp> <value> [retries]");
        var free = new List<PHYSICAL_MONITOR[]>();
        try
        {
            switch (args[0].ToLowerInvariant())
            {
                case "list":
                {
                    var mons = Open(free, true);
                    var parts = new List<string>();
                    foreach (var m in mons) parts.Add("{\"device\":" + J(m.Device) + ",\"index\":" + m.Index + ",\"name\":" + J(m.Name) +
                        ",\"id\":" + J(m.Id) + ",\"left\":" + m.Rect.left + ",\"top\":" + m.Rect.top +
                        ",\"width\":" + (m.Rect.right - m.Rect.left) + ",\"height\":" + (m.Rect.bottom - m.Rect.top) + "}");
                    Console.WriteLine("{\"ok\":true,\"monitors\":[" + string.Join(",", parts.ToArray()) + "]}");
                    return 0;
                }
                case "get":
                {
                    if (args.Length < 4) return Fail("get needs <device> <index> <vcp>");
                    var m = Find(Open(free, false), args[1], int.Parse(args[2]));
                    if (m == null) return Fail("monitor not found: " + args[1] + " #" + args[2]);
                    byte code = Convert.ToByte(args[3], 16);
                    uint cur, max;
                    for (int attempt = 0; attempt < 3; attempt++)
                    {
                        if (GetVCPFeatureAndVCPFeatureReply(m.Handle, code, IntPtr.Zero, out cur, out max))
                        {
                            Console.WriteLine("{\"ok\":true,\"current\":" + cur + ",\"max\":" + max + "}");
                            return 0;
                        }
                        Thread.Sleep(100);
                    }
                    return Fail("monitor did not answer (DDC/CI read failed, Win32 error " + Marshal.GetLastWin32Error() + ")");
                }
                case "set":
                {
                    if (args.Length < 5) return Fail("set needs <device> <index> <vcp> <value>");
                    var m = Find(Open(free, false), args[1], int.Parse(args[2]));
                    if (m == null) return Fail("monitor not found: " + args[1] + " #" + args[2]);
                    byte code = Convert.ToByte(args[3], 16);
                    uint value = uint.Parse(args[4]);
                    int retries = args.Length > 5 ? int.Parse(args[5]) : 3;
                    for (int attempt = 1; attempt <= retries; attempt++)
                    {
                        if (SetVCPFeature(m.Handle, code, value))
                        {
                            Console.WriteLine("{\"ok\":true,\"attempts\":" + attempt + "}");
                            return 0;
                        }
                        Thread.Sleep(200);
                    }
                    return Fail("monitor did not accept the command after " + retries + " attempts");
                }
                default:
                    return Fail("unknown command: " + args[0]);
            }
        }
        catch (Exception e) { return Fail(e.Message); }
        finally { Close(free); }
    }
}
