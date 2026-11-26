// Battery helper for the Deck Toolkit Stream Deck plugin.
//   headset list          -> all devices with a battery: Arctis base station + Bluetooth devices
//   headset bt <id>       -> battery of a Bluetooth device (Windows battery property)
//   headset [arctis]      -> SteelSeries Arctis Nova Pro Wireless (base station VID 1038, PID 12E0/12E5).
// Protocol (from the open-source HeadsetControl project): write 06 B0 to HID interface 4,
// response[6] = level 0..8, response[15] = status (01 offline, 02 charging, else available).
// Output: {"ok":true,"level":75,"raw":6,"status":"available|charging|offline"}
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

static class Headset
{
    [StructLayout(LayoutKind.Sequential)]
    struct SP_DEVICE_INTERFACE_DATA { public int cbSize; public Guid InterfaceClassGuid; public int Flags; public IntPtr Reserved; }

    [StructLayout(LayoutKind.Sequential)]
    struct HIDP_CAPS
    {
        public ushort Usage, UsagePage, InputReportByteLength, OutputReportByteLength, FeatureReportByteLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)] public ushort[] Reserved;
        public ushort a, b, c, d, e, f, g, h, i, j;
    }

    [DllImport("hid.dll")] static extern void HidD_GetHidGuid(out Guid g);
    [DllImport("hid.dll")] static extern bool HidD_GetPreparsedData(SafeFileHandle h, out IntPtr data);
    [DllImport("hid.dll")] static extern bool HidD_FreePreparsedData(IntPtr data);
    [DllImport("hid.dll")] static extern int HidP_GetCaps(IntPtr data, out HIDP_CAPS caps);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode)] static extern IntPtr SetupDiGetClassDevs(ref Guid g, IntPtr e, IntPtr w, int flags);
    [DllImport("setupapi.dll")] static extern bool SetupDiEnumDeviceInterfaces(IntPtr set, IntPtr info, ref Guid g, int idx, ref SP_DEVICE_INTERFACE_DATA d);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode)] static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr set, ref SP_DEVICE_INTERFACE_DATA d, IntPtr detail, int size, out int req, IntPtr info);
    [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);

    static List<string> Paths()
    {
        Guid g; HidD_GetHidGuid(out g);
        var set = SetupDiGetClassDevs(ref g, IntPtr.Zero, IntPtr.Zero, 0x12); // PRESENT | DEVICEINTERFACE
        var list = new List<string>();
        var d = new SP_DEVICE_INTERFACE_DATA(); d.cbSize = Marshal.SizeOf(d);
        for (int i = 0; SetupDiEnumDeviceInterfaces(set, IntPtr.Zero, ref g, i, ref d); i++)
        {
            int req; SetupDiGetDeviceInterfaceDetail(set, ref d, IntPtr.Zero, 0, out req, IntPtr.Zero);
            var buf = Marshal.AllocHGlobal(req);
            Marshal.WriteInt32(buf, IntPtr.Size == 8 ? 8 : 6);
            if (SetupDiGetDeviceInterfaceDetail(set, ref d, buf, req, out req, IntPtr.Zero))
            {
                var p = Marshal.PtrToStringUni(buf + 4);
                var l = p.ToLowerInvariant();
                if (l.Contains("vid_1038") && (l.Contains("pid_12e0") || l.Contains("pid_12e5")) && l.Contains("mi_04")) list.Add(p);
            }
            Marshal.FreeHGlobal(buf);
        }
        SetupDiDestroyDeviceInfoList(set);
        return list;
    }

    static int Out(string json, int code) { Console.WriteLine(json); return code; }

    static string Esc(string s) { return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\""); }

    // ---------------- Bluetooth battery (any device Windows reports a battery level for) ----------------

    [StructLayout(LayoutKind.Sequential)]
    struct SP_DEVINFO_DATA { public int cbSize; public Guid ClassGuid; public int DevInst; public IntPtr Reserved; }
    [StructLayout(LayoutKind.Sequential)]
    struct DEVPROPKEY { public Guid fmtid; public uint pid; public DEVPROPKEY(string g, uint p) { fmtid = new Guid(g); pid = p; } }

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, EntryPoint = "SetupDiGetClassDevsW")]
    static extern IntPtr SetupDiGetClassDevsAll(IntPtr g, string e, IntPtr w, int flags);
    [DllImport("setupapi.dll")] static extern bool SetupDiEnumDeviceInfo(IntPtr set, int idx, ref SP_DEVINFO_DATA d);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode)]
    static extern bool SetupDiGetDevicePropertyW(IntPtr set, ref SP_DEVINFO_DATA d, ref DEVPROPKEY key, out uint type, byte[] buf, int size, out int req, int flags);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode)]
    static extern bool SetupDiGetDeviceInstanceId(IntPtr set, ref SP_DEVINFO_DATA d, StringBuilder id, int size, out int req);

    static readonly DEVPROPKEY KeyBattery = new DEVPROPKEY("104EA319-6EE2-4701-BD47-8DDBF425BBE5", 2);
    static readonly DEVPROPKEY KeyConnected = new DEVPROPKEY("83DA6326-97A6-4088-9453-A1923F573B29", 15);
    static readonly DEVPROPKEY KeyFriendly = new DEVPROPKEY("A45C254E-DF1C-4EFD-8020-67D146A850E0", 14);
    static readonly DEVPROPKEY KeyDesc = new DEVPROPKEY("A45C254E-DF1C-4EFD-8020-67D146A850E0", 2);

    static byte[] Prop(IntPtr set, ref SP_DEVINFO_DATA d, DEVPROPKEY key)
    {
        uint type; int req;
        var buf = new byte[512];
        if (!SetupDiGetDevicePropertyW(set, ref d, ref key, out type, buf, buf.Length, out req, 0) || req == 0) return null;
        var r = new byte[req]; Array.Copy(buf, r, req); return r;
    }

    class BtDev { public string Id, Name; public int Level; public bool Connected; }

    static List<BtDev> BtDevices()
    {
        var list = new List<BtDev>();
        var set = SetupDiGetClassDevsAll(IntPtr.Zero, null, IntPtr.Zero, 0x6); // ALLCLASSES | PRESENT
        var d = new SP_DEVINFO_DATA(); d.cbSize = Marshal.SizeOf(d);
        for (int i = 0; SetupDiEnumDeviceInfo(set, i, ref d); i++)
        {
            var bat = Prop(set, ref d, KeyBattery);
            if (bat == null || bat.Length < 1) continue;
            var sb = new StringBuilder(512); int req;
            SetupDiGetDeviceInstanceId(set, ref d, sb, sb.Capacity, out req);
            var name = Prop(set, ref d, KeyFriendly) ?? Prop(set, ref d, KeyDesc);
            var con = Prop(set, ref d, KeyConnected);
            list.Add(new BtDev {
                Id = sb.ToString(),
                Name = name == null ? sb.ToString() : Encoding.Unicode.GetString(name).TrimEnd('\0'),
                Level = Math.Min(100, (int)bat[0]),
                // Devices without the flag are treated as connected (the battery value is then current).
                Connected = con == null || con.Length == 0 || con[0] != 0,
            });
        }
        SetupDiDestroyDeviceInfoList(set);
        return list;
    }

    static int Main(string[] args)
    {
        string cmd = args.Length > 0 ? args[0] : "arctis";
        if (cmd == "list")
        {
            // All devices with a battery: the Arctis base station (if plugged in) + Bluetooth devices.
            var sb = new StringBuilder("{\"ok\":true,\"devices\":[");
            bool first = true;
            if (Paths().Count > 0) { sb.Append("{\"id\":\"arctis\",\"name\":\"SteelSeries Arctis Nova Pro Wireless\",\"kind\":\"usb\"}"); first = false; }
            foreach (var b in BtDevices())
            {
                if (!first) sb.Append(',');
                first = false;
                sb.Append("{\"id\":\"" + Esc(b.Id) + "\",\"name\":\"" + Esc(b.Name) + "\",\"kind\":\"bt\",\"level\":" + b.Level + ",\"connected\":" + (b.Connected ? "true" : "false") + "}");
            }
            return Out(sb.Append("]}").ToString(), 0);
        }
        if (cmd == "bt")
        {
            if (args.Length < 2) return Out("{\"ok\":false,\"error\":\"usage: headset bt <device id>\"}", 2);
            foreach (var b in BtDevices())
                if (string.Equals(b.Id, args[1], StringComparison.OrdinalIgnoreCase))
                    return Out(b.Connected
                        ? "{\"ok\":true,\"level\":" + b.Level + ",\"status\":\"available\",\"name\":\"" + Esc(b.Name) + "\"}"
                        : "{\"ok\":true,\"status\":\"offline\",\"name\":\"" + Esc(b.Name) + "\"}", 0);
            return Out("{\"ok\":false,\"error\":\"device not found\"}", 1);
        }
        return Arctis(cmd == "debug");
    }

    // ---------------- SteelSeries Arctis Nova Pro Wireless (USB base station) ----------------

    static int Arctis(bool debug)
    {
        var paths = Paths();
        if (paths.Count == 0) return Out("{\"ok\":false,\"error\":\"base station not found\"}", 1);
        string lastErr = "no answer";
        foreach (var path in paths)
        {
            using (var h = CreateFile(path, 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero))
            {
                if (h.IsInvalid) { lastErr = "cannot open device (" + Marshal.GetLastWin32Error() + ")"; continue; }
                IntPtr pd; HIDP_CAPS caps;
                if (!HidD_GetPreparsedData(h, out pd)) continue;
                HidP_GetCaps(pd, out caps); HidD_FreePreparsedData(pd);
                if (debug) Console.Error.WriteLine(path + " usage=" + caps.UsagePage.ToString("X") + "/" + caps.Usage.ToString("X") + " in=" + caps.InputReportByteLength + " out=" + caps.OutputReportByteLength);
                if (caps.OutputReportByteLength == 0 || caps.InputReportByteLength == 0) continue;
                try
                {
                    using (var fs = new FileStream(h, FileAccess.ReadWrite, Math.Max(caps.InputReportByteLength, caps.OutputReportByteLength)))
                    {
                        var req = new byte[caps.OutputReportByteLength];
                        req[0] = 0x06; req[1] = 0xB0;
                        fs.Write(req, 0, req.Length);
                        var deadline = DateTime.UtcNow.AddSeconds(2);
                        while (DateTime.UtcNow < deadline)
                        {
                            var resp = new byte[caps.InputReportByteLength];
                            var ar = fs.BeginRead(resp, 0, resp.Length, null, null);
                            if (!ar.AsyncWaitHandle.WaitOne(1000)) { lastErr = "timeout"; break; }
                            int n = fs.EndRead(ar);
                            if (debug) Console.Error.WriteLine("resp: " + BitConverter.ToString(resp, 0, Math.Min(n, 20)));
                            if (n < 16 || resp[0] != 0x06 || resp[1] != 0xB0) continue;
                            int raw = resp[6];
                            byte st = resp[15];
                            if (st == 0x01) return Out("{\"ok\":true,\"status\":\"offline\"}", 0);
                            int level = Math.Max(0, Math.Min(100, raw * 100 / 8));
                            int spare = Math.Max(0, Math.Min(100, resp[7] * 100 / 8)); // hot-swap battery in the base station
                            string status = st == 0x02 ? "charging" : "available";
                            return Out("{\"ok\":true,\"level\":" + level + ",\"raw\":" + raw + ",\"spare\":" + spare + ",\"status\":\"" + status + "\"}", 0);
                        }
                    }
                }
                catch (Exception e) { lastErr = e.Message; }
            }
        }
        return Out("{\"ok\":false,\"error\":\"" + lastErr.Replace("\"", "'") + "\"}", 1);
    }
}
