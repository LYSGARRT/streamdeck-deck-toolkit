// SwitchBot Bot over the PC's own Bluetooth (no hub, no cloud).
//   switchbot scan [seconds]   -> {"ok":true,"devices":[...]}
//   switchbot press <mac>      -> {"ok":true} or {"ok":false,"error":"..."}
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Windows.Devices.Bluetooth;
using Windows.Devices.Bluetooth.Advertisement;
using Windows.Devices.Bluetooth.GenericAttributeProfile;
using Windows.Storage.Streams;

class SwitchBot
{
	static readonly Guid SVC = new Guid("cba20d00-224d-11e6-9fb8-0002a5d5c51b");
	static readonly Guid TX = new Guid("cba20002-224d-11e6-9fb8-0002a5d5c51b");
	static readonly Guid RX = new Guid("cba20003-224d-11e6-9fb8-0002a5d5c51b");

	static int Main(string[] a)
	{
		try
		{
			if (a.Length > 0 && a[0] == "scan") return Scan(a.Length > 1 ? int.Parse(a[1]) : 8);
			if (a.Length > 1 && a[0] == "press") return Press(ParseMac(a[1]));
			Console.Error.WriteLine("usage: switchbot scan [seconds] | press <mac>");
			return 2;
		}
		catch (Exception e)
		{
			Fail((e.InnerException ?? e).Message);
			return 1;
		}
	}

	static void Fail(string m) { Console.WriteLine("{\"ok\":false,\"error\":\"" + m.Trim().Replace("\\", "/").Replace("\"", "'").Replace("\r", " ").Replace("\n", " ") + "\"}"); }
	static void Ok() { Console.WriteLine("{\"ok\":true}"); }

	static ulong ParseMac(string s) { return Convert.ToUInt64(s.Replace(":", "").Replace("-", ""), 16); }
	static string Mac(ulong v)
	{
		var h = v.ToString("X12");
		return string.Join(":", Enumerable.Range(0, 6).Select(i => h.Substring(i * 2, 2)));
	}

	class Dev { public string Mac; public char Type = '?'; public int Rssi; public int Battery = -1; public string Name = ""; }

	static int Scan(int seconds)
	{
		var found = new Dictionary<ulong, Dev>();
		var w = new BluetoothLEAdvertisementWatcher { ScanningMode = BluetoothLEScanningMode.Active };
		w.Received += (s, e) =>
		{
			byte[] svc = null;
			bool isBot = false;
			foreach (var sec in e.Advertisement.DataSections)
			{
				if (sec.DataType != 0x16) continue; // 16-bit service data
				var d = Read(sec.Data);
				if (d.Length < 3) continue;
				int uuid = d[0] | (d[1] << 8);
				if (uuid == 0xfd3d || uuid == 0x0d00) { svc = d.Skip(2).ToArray(); isBot = true; }
			}
			foreach (var m in e.Advertisement.ManufacturerData)
				if (m.CompanyId == 0x0969) isBot = true;
			if (!isBot && !e.Advertisement.ServiceUuids.Contains(SVC)) return;
			lock (found)
			{
				Dev dev;
				if (!found.TryGetValue(e.BluetoothAddress, out dev))
					found[e.BluetoothAddress] = dev = new Dev { Mac = Mac(e.BluetoothAddress) };
				dev.Rssi = e.RawSignalStrengthInDBm;
				if (!string.IsNullOrEmpty(e.Advertisement.LocalName)) dev.Name = e.Advertisement.LocalName;
				if (svc != null && svc.Length >= 1) dev.Type = (char)(svc[0] & 0x7f);
				if (svc != null && svc.Length >= 3) dev.Battery = svc[2] & 0x7f;
			}
		};
		w.Start();
		Thread.Sleep(seconds * 1000);
		w.Stop();
		lock (found)
			Console.WriteLine("{\"ok\":true,\"devices\":[" + string.Join(",", found.Values.OrderByDescending(x => x.Rssi).Select(d =>
				string.Format("{{\"mac\":\"{0}\",\"type\":\"{1}\",\"rssi\":{2},\"battery\":{3},\"name\":\"{4}\"}}",
					d.Mac, char.IsLetterOrDigit(d.Type) ? d.Type : '?', d.Rssi, d.Battery, d.Name.Replace("\"", "").Replace("\\", "")))) + "]}");
		return 0;
	}

	static byte[] Read(IBuffer b)
	{
		var r = DataReader.FromBuffer(b);
		var x = new byte[b.Length];
		r.ReadBytes(x);
		return x;
	}

	static int Press(ulong addr)
	{
		string last = "not found";
		for (int attempt = 0; attempt < 3; attempt++)
		{
			BluetoothLEDevice dev = null;
			try
			{
				dev = BluetoothLEDevice.FromBluetoothAddressAsync(addr, BluetoothAddressType.Random).AsTask().Result
					?? BluetoothLEDevice.FromBluetoothAddressAsync(addr).AsTask().Result;
				if (dev == null) { last = "not found"; Thread.Sleep(800); continue; }
				var sr = dev.GetGattServicesForUuidAsync(SVC, BluetoothCacheMode.Uncached).AsTask().Result;
				if (sr.Status != GattCommunicationStatus.Success || sr.Services.Count == 0) { last = "no service (" + sr.Status + ")"; Thread.Sleep(800); continue; }
				var service = sr.Services[0];
				var tx = service.GetCharacteristicsForUuidAsync(TX, BluetoothCacheMode.Uncached).AsTask().Result.Characteristics.FirstOrDefault();
				var rx = service.GetCharacteristicsForUuidAsync(RX, BluetoothCacheMode.Uncached).AsTask().Result.Characteristics.FirstOrDefault();
				if (tx == null) { last = "no write characteristic"; continue; }

				var reply = new TaskCompletionSource<byte[]>();
				if (rx != null)
				{
					rx.ValueChanged += (c, e) => reply.TrySetResult(Read(e.CharacteristicValue));
					rx.WriteClientCharacteristicConfigurationDescriptorAsync(GattClientCharacteristicConfigurationDescriptorValue.Notify).AsTask().Wait(3000);
				}

				var w = new DataWriter();
				w.WriteBytes(new byte[] { 0x57, 0x01, 0x00 }); // press
				var st = tx.WriteValueAsync(w.DetachBuffer(), GattWriteOption.WriteWithResponse).AsTask().Result;
				if (st != GattCommunicationStatus.Success) { last = "write " + st; Thread.Sleep(800); continue; }

				if (rx != null && reply.Task.Wait(4000))
				{
					var r = reply.Task.Result;
					// 0x01 / 0x05 = done (same as pySwitchbot), 0x09 = bot has a password
					if (r.Length > 0 && (r[0] == 0x01 || r[0] == 0x05)) { Ok(); return 0; }
					if (r.Length > 0 && r[0] == 0x09) { Fail("password protected"); return 1; }
					Fail("unexpected reply " + BitConverter.ToString(r));
					return 1;
				}
				Ok();
				return 0;
			}
			catch (Exception e) { last = (e.InnerException ?? e).Message.Trim(); Thread.Sleep(800); }
			finally { if (dev != null) dev.Dispose(); }
		}
		Fail(last);
		return 1;
	}
}
