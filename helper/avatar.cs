// Builds the key image for a Twitch channel: round profile picture on a background tile.
// Usage: avatar.exe <picture> <background.png|-> <output.png> <live|off>
//   live = colour, pink ring, red LIVE badge; off = greyscale and darker, grey ring. "-" = black background.
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;

static class Avatar
{
	static int Main(string[] a)
	{
		if (a.Length < 4) { Console.Error.WriteLine("usage: avatar <in> <tile|-> <out> <live|off>"); return 2; }
		bool live = a[3] == "live";
		try
		{
			using (var bmp = new Bitmap(144, 144, PixelFormat.Format32bppArgb))
			using (var g = Graphics.FromImage(bmp))
			{
				g.SmoothingMode = SmoothingMode.AntiAlias;
				g.InterpolationMode = InterpolationMode.HighQualityBicubic;
				g.PixelOffsetMode = PixelOffsetMode.HighQuality;
				g.Clear(Color.Black);
				if (a[1] != "-" && System.IO.File.Exists(a[1]))
					using (var tile = Image.FromFile(a[1])) g.DrawImage(tile, 0, 0, 144, 144);

				// Ring
				var ring = live ? Color.FromArgb(255, 255, 92, 147) : Color.FromArgb(235, 150, 150, 150);
				using (var b = new SolidBrush(ring)) g.FillEllipse(b, 14, 14, 116, 116);

				// Profilbild, rund
				using (var src = Image.FromFile(a[0]))
				using (var path = new GraphicsPath())
				using (var ia = new ImageAttributes())
				{
					path.AddEllipse(18, 18, 108, 108);
					g.SetClip(path);
					if (!live)
					{
						// Graustufen und etwas dunkler, wie bei Twitch Tools.
						const float k = 0.62f;
						ia.SetColorMatrix(new ColorMatrix(new[] {
							new[] { 0.299f * k, 0.299f * k, 0.299f * k, 0, 0 },
							new[] { 0.587f * k, 0.587f * k, 0.587f * k, 0, 0 },
							new[] { 0.114f * k, 0.114f * k, 0.114f * k, 0, 0 },
							new[] { 0f, 0, 0, 1, 0 },
							new[] { 0f, 0, 0, 0, 1 },
						}));
					}
					g.DrawImage(src, new Rectangle(18, 18, 108, 108), 0, 0, src.Width, src.Height, GraphicsUnit.Pixel, ia);
					g.ResetClip();
				}

				if (live)
				{
					// Rotes LIVE-Schild unten mittig auf dem Ring.
					var r = new RectangleF(46, 113, 52, 22);
					using (var p = Rounded(r, 6))
					{
						using (var b = new SolidBrush(Color.FromArgb(255, 235, 4, 0))) g.FillPath(b, p);
						using (var pen = new Pen(Color.FromArgb(255, 20, 20, 20), 2f)) g.DrawPath(pen, p);
					}
					g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
					using (var f = new Font("Segoe UI", 11f, FontStyle.Bold, GraphicsUnit.Pixel))
					using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
						g.DrawString("LIVE", f, Brushes.White, new RectangleF(r.X, r.Y + 0.5f, r.Width, r.Height), sf);
				}
				bmp.Save(a[2], ImageFormat.Png);
			}
			return 0;
		}
		catch (Exception e) { Console.Error.WriteLine(e.Message); return 1; }
	}

	static GraphicsPath Rounded(RectangleF r, float rad)
	{
		var p = new GraphicsPath();
		float d = rad * 2;
		p.AddArc(r.X, r.Y, d, d, 180, 90);
		p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
		p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
		p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
		p.CloseFigure();
		return p;
	}
}
