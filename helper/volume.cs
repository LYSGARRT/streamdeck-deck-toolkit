// Volume helper for the Deck Toolkit Stream Deck plugin (Windows Core Audio).
// Runs permanently, reads commands line by line from stdin and reports changes as JSON lines on stdout.
//
// Targets (<target>): "out" = current default playback device, "in" = default recording device,
//                     otherwise a device id like {0.0.1.00000000}.{af309120-...}
// Commands:
//   watch <target>          watch a target (changes are reported)
//   unwatch <target>
//   step <target> <delta>   change volume by delta percent (unmutes when turning up)
//   set <target> <pct>
//   mute <target> toggle|on|off
//   list                    print all active devices
// Output:
//   {"t":"out","ok":true,"vol":42,"mute":false,"name":"Speakers (Realtek(R) Audio)","id":"..."}
//   {"list":[{"id":"...","name":"...","flow":"out"}]}
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorCom { }

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator
{
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
}

[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection
{
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int Item(uint index, out IMMDevice device);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice
{
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore store);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetState(out int state);
}

[StructLayout(LayoutKind.Sequential)]
struct PROPERTYKEY { public Guid fmtid; public int pid; }

[StructLayout(LayoutKind.Explicit, Size = 24)]
struct PROPVARIANT { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr p; }

[Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPropertyStore
{
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetAt(int index, out PROPERTYKEY key);
    [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT value);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume
{
    [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int GetChannelCount(out uint count);
    [PreserveSig] int SetMasterVolumeLevel(float levelDB, ref Guid ctx);
    [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    [PreserveSig] int GetMasterVolumeLevel(out float levelDB);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
    [PreserveSig] int SetChannelVolumeLevel(uint ch, float levelDB, ref Guid ctx);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint ch, float level, ref Guid ctx);
    [PreserveSig] int GetChannelVolumeLevel(uint ch, out float levelDB);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint ch, out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}

static class Volume
{
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT pv);

    static readonly object Lock = new object();
    static IMMDeviceEnumerator enumerator;
    static readonly Dictionary<string, string> last = new Dictionary<string, string>();
    static readonly HashSet<string> watched = new HashSet<string>();
    static Guid ctx = Guid.Empty;

    static void Out(string line)
    {
        lock (Console.Out) { Console.Out.WriteLine(line); Console.Out.Flush(); }
    }

    static string Esc(string s)
    {
        if (s == null) return "";
        var sb = new StringBuilder();
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c < 0x20) sb.AppendFormat("\\u{0:x4}", (int)c);
            else sb.Append(c);
        }
        return sb.ToString();
    }

    static IMMDevice Resolve(string target)
    {
        IMMDevice dev = null;
        int hr;
        if (target == "out") hr = enumerator.GetDefaultAudioEndpoint(0, 1, out dev);      // eRender, eMultimedia
        else if (target == "in") hr = enumerator.GetDefaultAudioEndpoint(1, 1, out dev);  // eCapture, eMultimedia
        else hr = enumerator.GetDevice(target, out dev);
        if (hr != 0 || dev == null) return null;
        int state;
        if (dev.GetState(out state) != 0 || state != 1) return null; // nur aktive Geräte
        return dev;
    }

    static IAudioEndpointVolume Endpoint(IMMDevice dev)
    {
        Guid iid = typeof(IAudioEndpointVolume).GUID;
        object o;
        if (dev.Activate(ref iid, 23 /* CLSCTX_ALL */, IntPtr.Zero, out o) != 0) return null;
        return o as IAudioEndpointVolume;
    }

    static string Name(IMMDevice dev)
    {
        IPropertyStore store;
        if (dev.OpenPropertyStore(0, out store) != 0 || store == null) return "";
        var key = new PROPERTYKEY { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };
        PROPVARIANT pv;
        if (store.GetValue(ref key, out pv) != 0) return "";
        string name = pv.vt == 31 /* VT_LPWSTR */ ? Marshal.PtrToStringUni(pv.p) : "";
        PropVariantClear(ref pv);
        return name;
    }

    static string State(string target)
    {
        var dev = Resolve(target);
        if (dev == null) return "{\"t\":\"" + Esc(target) + "\",\"ok\":false}";
        var ep = Endpoint(dev);
        if (ep == null) return "{\"t\":\"" + Esc(target) + "\",\"ok\":false}";
        float lvl; bool mute; string id;
        ep.GetMasterVolumeLevelScalar(out lvl);
        ep.GetMute(out mute);
        dev.GetId(out id);
        int pct = (int)Math.Round(lvl * 100);
        return "{\"t\":\"" + Esc(target) + "\",\"ok\":true,\"vol\":" + pct + ",\"mute\":" + (mute ? "true" : "false") +
               ",\"name\":\"" + Esc(Name(dev)) + "\",\"id\":\"" + Esc(id) + "\"}";
    }

    /** Meldet ein Ziel, wenn sich etwas geändert hat (oder immer, wenn force). */
    static void Report(string target, bool force)
    {
        string s;
        try { s = State(target); } catch (Exception e) { s = "{\"t\":\"" + Esc(target) + "\",\"ok\":false,\"error\":\"" + Esc(e.Message) + "\"}"; }
        string prev;
        if (!force && last.TryGetValue(target, out prev) && prev == s) return;
        last[target] = s;
        Out(s);
    }

    static void Apply(string cmd, string target, string arg)
    {
        var dev = Resolve(target);
        var ep = dev == null ? null : Endpoint(dev);
        if (ep == null) { Report(target, true); return; }
        float lvl; bool mute;
        ep.GetMasterVolumeLevelScalar(out lvl);
        ep.GetMute(out mute);
        if (cmd == "step" || cmd == "set")
        {
            double v = double.Parse(arg, System.Globalization.CultureInfo.InvariantCulture);
            double pct = cmd == "step" ? Math.Round(lvl * 100) + v : v;
            // auf Vielfache der Schrittweite einrasten, damit 37 % + 5 -> 40 % wird
            if (cmd == "step" && v != 0)
            {
                double step = Math.Abs(v);
                double cur = Math.Round(lvl * 100);
                pct = v > 0 ? Math.Floor(cur / step) * step + step : Math.Ceiling(cur / step) * step - step;
            }
            pct = Math.Max(0, Math.Min(100, pct));
            ep.SetMasterVolumeLevelScalar((float)(pct / 100.0), ref ctx);
            if (mute && cmd == "step" && v > 0) ep.SetMute(false, ref ctx);
        }
        else if (cmd == "mute")
        {
            bool m = arg == "on" ? true : arg == "off" ? false : !mute;
            ep.SetMute(m, ref ctx);
        }
        Report(target, true);
    }

    static void List()
    {
        var sb = new StringBuilder("{\"list\":[");
        bool first = true;
        for (int flow = 0; flow < 2; flow++)
        {
            IMMDeviceCollection col;
            if (enumerator.EnumAudioEndpoints(flow, 1, out col) != 0) continue;
            uint n; col.GetCount(out n);
            for (uint i = 0; i < n; i++)
            {
                IMMDevice d; if (col.Item(i, out d) != 0) continue;
                string id; d.GetId(out id);
                if (!first) sb.Append(',');
                first = false;
                sb.Append("{\"id\":\"").Append(Esc(id)).Append("\",\"name\":\"").Append(Esc(Name(d)))
                  .Append("\",\"flow\":\"").Append(flow == 0 ? "out" : "in").Append("\"}");
            }
        }
        sb.Append("]}");
        Out(sb.ToString());
    }

    [MTAThread]
    static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        Console.InputEncoding = new UTF8Encoding(false);
        enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();

        // Einmal-Modus zum Testen: volume.exe get out
        if (args.Length >= 2 && args[0] == "get") { Out(State(args[1])); return 0; }
        if (args.Length >= 1 && args[0] == "list") { List(); return 0; }

        // Änderungen von außen (Windows-Mixer, Tastatur, Gerätewechsel) per Abfrage erkennen.
        var poller = new Thread(() =>
        {
            for (;;)
            {
                Thread.Sleep(300);
                lock (Lock) { foreach (var t in new List<string>(watched)) Report(t, false); }
            }
        });
        poller.IsBackground = true;
        poller.Start();

        string line;
        while ((line = Console.In.ReadLine()) != null)
        {
            var p = line.Trim().TrimStart('﻿').Split(new[] { ' ' }, 3, StringSplitOptions.RemoveEmptyEntries);
            if (p.Length == 0) continue;
            try
            {
                lock (Lock)
                {
                    switch (p[0])
                    {
                        case "watch": if (p.Length > 1) { watched.Add(p[1]); Report(p[1], true); } break;
                        case "unwatch": if (p.Length > 1) { watched.Remove(p[1]); last.Remove(p[1]); } break;
                        case "step":
                        case "set":
                        case "mute": if (p.Length > 2) Apply(p[0], p[1], p[2]); break;
                        case "list": List(); break;
                    }
                }
            }
            catch (Exception e) { Out("{\"error\":\"" + Esc(e.Message) + "\"}"); }
        }
        return 0;
    }
}
