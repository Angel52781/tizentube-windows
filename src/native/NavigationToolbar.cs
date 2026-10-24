// TizenTube Windows — native navigation chrome, independent of YouTube DOM.
// GPL-3.0-only. Original vector glyphs drawn at the active Windows DPI.
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace TizenTubeWindows
{
    internal sealed class NavigationToolbar : Panel
    {
        private readonly GlyphButton back;
        private readonly GlyphButton reload;
        private readonly Label title;
        private readonly ToolTip tips = new ToolTip();

        public NavigationToolbar(Action navigateBack, Action reloadPage)
        {
            BackColor = Color.FromArgb(31, 31, 31);
            Dock = DockStyle.Top;
            Height = 38;
            Margin = Padding.Empty;
            Padding = Padding.Empty;
            back = new GlyphButton(GlyphButton.Kind.Back) {
                Location = new Point(10, 3), Size = new Size(32, 32),
                AccessibleName = "Volver a la página anterior"
            };
            reload = new GlyphButton(GlyphButton.Kind.Reload) {
                Location = new Point(48, 3), Size = new Size(32, 32),
                AccessibleName = "Recargar la página"
            };
            title = new Label {
                Text = "TizenTube — YouTube",
                ForeColor = Color.FromArgb(227, 227, 227),
                BackColor = BackColor,
                Font = new Font("Segoe UI", 9f, FontStyle.Regular),
                TextAlign = ContentAlignment.MiddleLeft,
                AutoEllipsis = true,
                Location = new Point(94, 2),
                Height = 34
            };
            back.Click += (s, e) => navigateBack?.Invoke();
            reload.Click += (s, e) => reloadPage?.Invoke();
            tips.SetToolTip(back, "Atrás (Alt + ←)");
            tips.SetToolTip(reload, "Recargar (Ctrl + R)");
            Controls.Add(back);
            Controls.Add(reload);
            Controls.Add(title);
            Resize += (s, e) => LayoutTitle();
            LayoutTitle();
            SetBackEnabled(false);
        }

        private void LayoutTitle()
        {
            title.Width = Math.Max(0, ClientSize.Width - 108);
        }

        public void SetBackEnabled(bool enabled)
        {
            if (back.Enabled != enabled) back.Enabled = enabled;
        }

        public void SetTitle(string value)
        {
            title.Text = string.IsNullOrWhiteSpace(value)
                ? "TizenTube — YouTube"
                : value.Length > 250 ? value.Substring(0, 250) : value;
        }

        public bool BackEnabled => back.Enabled;
        public bool InvokeBackForProbe()
        {
            if (!back.Enabled) return false;
            back.PerformAction();
            return true;
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) tips.Dispose();
            base.Dispose(disposing);
        }

        private sealed class GlyphButton : Control
        {
            internal enum Kind { Back, Reload }
            private readonly Kind kind;
            private bool hovered;

            public GlyphButton(Kind kind)
            {
                this.kind = kind;
                TabStop = true;
                AccessibleRole = AccessibleRole.PushButton;
                BackColor = Color.FromArgb(31, 31, 31);
                Cursor = Cursors.Hand;
                SetStyle(ControlStyles.AllPaintingInWmPaint |
                    ControlStyles.OptimizedDoubleBuffer |
                    ControlStyles.UserPaint, true);
            }

            public void PerformAction()
            {
                if (Enabled) OnClick(EventArgs.Empty);
            }

            protected override void OnMouseEnter(EventArgs e)
            {
                hovered = true;
                Invalidate();
                base.OnMouseEnter(e);
            }
            protected override void OnMouseLeave(EventArgs e)
            {
                hovered = false;
                Invalidate();
                base.OnMouseLeave(e);
            }
            protected override void OnEnabledChanged(EventArgs e)
            {
                Invalidate();
                base.OnEnabledChanged(e);
            }
            protected override void OnKeyDown(KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Enter || e.KeyCode == Keys.Space)
                {
                    PerformAction();
                    e.Handled = true;
                    e.SuppressKeyPress = true;
                }
                base.OnKeyDown(e);
            }
            protected override void OnPaint(PaintEventArgs e)
            {
                base.OnPaint(e);
                var g = e.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                if (hovered && Enabled)
                {
                    using (var hover = new SolidBrush(Color.FromArgb(51, 51, 51)))
                        g.FillEllipse(hover, 0, 0, Width - 1, Height - 1);
                }
                var foreground = Enabled
                    ? Color.FromArgb(239, 239, 239)
                    : Color.FromArgb(105, 105, 105);
                var state = g.Save();
                g.TranslateTransform(Width / 2f, Height / 2f);
                using (var pen = new Pen(foreground, 1.8f))
                {
                    pen.StartCap = LineCap.Round;
                    pen.EndCap = LineCap.Round;
                    pen.LineJoin = LineJoin.Round;
                    if (kind == Kind.Back)
                    {
                        g.DrawLine(pen, -7, 0, 7, 0);
                        g.DrawLine(pen, -7, 0, -1, -6);
                        g.DrawLine(pen, -7, 0, -1, 6);
                    }
                    else
                    {
                        g.DrawArc(pen, -8, -8, 16, 16, -66, 318);
                        g.DrawLine(pen, 7, -7, 9, -1);
                        g.DrawLine(pen, 7, -7, 1, -7);
                    }
                }
                g.Restore(state);
                if (Focused)
                    ControlPaint.DrawFocusRectangle(g, new Rectangle(3, 3, Width - 6, Height - 6), foreground, BackColor);
            }
        }
    }
}
