// TizenTube Windows — integrated native titlebar.
// GPL-3.0-only. Original scalable icons, no injected controls in YouTube.
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace TizenTubeWindows
{
    internal sealed class NavigationToolbar : Panel
    {
        private const int ChromeHeight = 38;
        private const int CaptionButtonWidth = 46;
        private readonly GlyphButton back;
        private readonly GlyphButton reload;
        private readonly GlyphButton minimize;
        private readonly GlyphButton maximize;
        private readonly GlyphButton close;
        private readonly PictureBox appIcon;
        private readonly Label title;
        private readonly ToolTip tips = new ToolTip();
        private readonly Action dragWindow;
        private readonly Action toggleMaximize;
        private bool isMaximized;

        public NavigationToolbar(Icon icon, Action navigateBack, Action reloadPage,
            Action drag, Action minimizeWindow, Action maximizeWindow, Action closeWindow)
        {
            dragWindow = drag;
            toggleMaximize = maximizeWindow;
            BackColor = Color.FromArgb(31, 31, 31);
            Dock = DockStyle.Top;
            Height = ChromeHeight;
            MinimumSize = new Size(0, ChromeHeight);
            Margin = Padding.Empty;
            Padding = Padding.Empty;
            SetStyle(ControlStyles.OptimizedDoubleBuffer |
                ControlStyles.AllPaintingInWmPaint, true);

            appIcon = new PictureBox {
                Size = new Size(18, 18), Location = new Point(9, 10),
                SizeMode = PictureBoxSizeMode.Zoom, BackColor = BackColor,
                TabStop = false, Image = (icon ?? SystemIcons.Application).ToBitmap()
            };
            back = new GlyphButton(GlyphButton.Kind.Back) {
                Location = new Point(36, 3), Size = new Size(32, 32),
                AccessibleName = "Volver a la página anterior"
            };
            reload = new GlyphButton(GlyphButton.Kind.Reload) {
                Location = new Point(72, 3), Size = new Size(32, 32),
                AccessibleName = "Recargar la página"
            };
            title = new Label {
                Text = "TizenTube — YouTube",
                ForeColor = Color.FromArgb(227, 227, 227),
                BackColor = BackColor, Font = new Font("Segoe UI", 9f),
                TextAlign = ContentAlignment.MiddleLeft,
                AutoEllipsis = true, Location = new Point(116, 2),
                Height = 34
            };
            minimize = new GlyphButton(GlyphButton.Kind.Minimize) {
                Size = new Size(CaptionButtonWidth, ChromeHeight),
                AccessibleName = "Minimizar"
            };
            maximize = new GlyphButton(GlyphButton.Kind.Maximize) {
                Size = new Size(CaptionButtonWidth, ChromeHeight),
                AccessibleName = "Maximizar"
            };
            close = new GlyphButton(GlyphButton.Kind.Close) {
                Size = new Size(CaptionButtonWidth, ChromeHeight),
                AccessibleName = "Cerrar"
            };
            back.Click += (s, e) => navigateBack?.Invoke();
            reload.Click += (s, e) => reloadPage?.Invoke();
            minimize.Click += (s, e) => minimizeWindow?.Invoke();
            maximize.Click += (s, e) => maximizeWindow?.Invoke();
            close.Click += (s, e) => closeWindow?.Invoke();
            tips.SetToolTip(back, "Atrás (Alt + ←)");
            tips.SetToolTip(reload, "Recargar (Ctrl + R)");
            tips.SetToolTip(minimize, "Minimizar");
            tips.SetToolTip(maximize, "Maximizar / Restaurar");
            tips.SetToolTip(close, "Cerrar");

            Controls.Add(appIcon);
            Controls.Add(back);
            Controls.Add(reload);
            Controls.Add(title);
            Controls.Add(minimize);
            Controls.Add(maximize);
            Controls.Add(close);
            MouseDown += (s, e) => { if (e.Button == MouseButtons.Left && e.Clicks == 1) dragWindow?.Invoke(); };
            title.MouseDown += (s, e) => { if (e.Button == MouseButtons.Left && e.Clicks == 1) dragWindow?.Invoke(); };
            title.DoubleClick += (s, e) => toggleMaximize?.Invoke();
            DoubleClick += (s, e) => toggleMaximize?.Invoke();
            Resize += (s, e) => LayoutChildren();
            LayoutChildren();
            SetBackEnabled(false);
        }

        private void LayoutChildren()
        {
            int right = ClientSize.Width;
            close.Location = new Point(right - CaptionButtonWidth, 0);
            maximize.Location = new Point(right - CaptionButtonWidth * 2, 0);
            minimize.Location = new Point(right - CaptionButtonWidth * 3, 0);
            title.Width = Math.Max(0, right - CaptionButtonWidth * 3 - title.Left - 5);
        }

        public void SetBackEnabled(bool enabled) { back.Enabled = enabled; }
        public bool BackEnabled => back.Enabled;
        public bool IsMaximized => isMaximized;
        public void SetTitle(string value)
        {
            title.Text = string.IsNullOrWhiteSpace(value)
                ? "TizenTube — YouTube"
                : value.Length > 250 ? value.Substring(0, 250) : value;
        }
        public void SetMaximized(bool value)
        {
            isMaximized = value;
            maximize.IsRestoring = value;
            maximize.AccessibleName = value ? "Restaurar" : "Maximizar";
            maximize.Invalidate();
        }

        // The CI probe exercises the actual WinForms click path.
        public bool InvokeBackForProbe()
        {
            if (!back.Enabled) return false;
            back.PerformAction();
            return true;
        }
        public void InvokeMaximizeForProbe() { maximize.PerformAction(); }
        public void InvokeMinimizeForProbe() { minimize.PerformAction(); }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                tips.Dispose();
                appIcon.Image?.Dispose();
            }
            base.Dispose(disposing);
        }

        private sealed class GlyphButton : Control
        {
            internal enum Kind { Back, Reload, Minimize, Maximize, Close }
            private readonly Kind kind;
            private bool hovered;
            internal bool IsRestoring { get; set; }

            public GlyphButton(Kind kind)
            {
                this.kind = kind;
                TabStop = true;
                AccessibleRole = AccessibleRole.PushButton;
                BackColor = Color.FromArgb(31, 31, 31);
                Cursor = Cursors.Hand;
                SetStyle(ControlStyles.AllPaintingInWmPaint |
                    ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
            }
            public void PerformAction() { if (Enabled) OnClick(EventArgs.Empty); }
            protected override void OnMouseEnter(EventArgs e)
            {
                hovered = true; Invalidate(); base.OnMouseEnter(e);
            }
            protected override void OnMouseLeave(EventArgs e)
            {
                hovered = false; Invalidate(); base.OnMouseLeave(e);
            }
            protected override void OnEnabledChanged(EventArgs e)
            {
                Invalidate(); base.OnEnabledChanged(e);
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
                    Color hover = kind == Kind.Close
                        ? Color.FromArgb(198, 45, 51)
                        : Color.FromArgb(51, 51, 51);
                    using (var brush = new SolidBrush(hover))
                    {
                        if (kind == Kind.Back || kind == Kind.Reload)
                            g.FillEllipse(brush, 0, 0, Width - 1, Height - 1);
                        else g.FillRectangle(brush, ClientRectangle);
                    }
                }
                var foreground = Enabled
                    ? Color.FromArgb(239, 239, 239)
                    : Color.FromArgb(105, 105, 105);
                var state = g.Save();
                g.TranslateTransform(Width / 2f, Height / 2f);
                using (var pen = new Pen(foreground, 1.7f))
                {
                    pen.StartCap = LineCap.Round;
                    pen.EndCap = LineCap.Round;
                    pen.LineJoin = LineJoin.Round;
                    switch (kind)
                    {
                        case Kind.Back:
                            g.DrawLine(pen, -7, 0, 7, 0);
                            g.DrawLine(pen, -7, 0, -1, -6);
                            g.DrawLine(pen, -7, 0, -1, 6);
                            break;
                        case Kind.Reload:
                            g.DrawArc(pen, -8, -8, 16, 16, -62, 320);
                            g.DrawLine(pen, 7, -7, 9, -1);
                            g.DrawLine(pen, 7, -7, 1, -7);
                            break;
                        case Kind.Minimize:
                            g.DrawLine(pen, -6, 0, 6, 0);
                            break;
                        case Kind.Maximize:
                            if (IsRestoring)
                            {
                                g.DrawRectangle(pen, -4, -6, 10, 9);
                                g.DrawRectangle(pen, -6, -3, 10, 9);
                            }
                            else g.DrawRectangle(pen, -6, -6, 12, 12);
                            break;
                        case Kind.Close:
                            g.DrawLine(pen, -6, -6, 6, 6);
                            g.DrawLine(pen, 6, -6, -6, 6);
                            break;
                    }
                }
                g.Restore(state);
                if (Focused)
                    ControlPaint.DrawFocusRectangle(g,
                        new Rectangle(2, 2, Width - 4, Height - 4), foreground, BackColor);
            }
        }
    }
}
