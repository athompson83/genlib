// SPDX-License-Identifier: Apache-2.0
using Avalonia;
using Velopack;
namespace GenlibInventory;
internal static class Program {
    [STAThread] public static void Main(string[] args) {
        VelopackApp.Build().SetAutoApplyOnStartup(false).Run();
        AppBuilder.Configure<App>().UsePlatformDetect().StartWithClassicDesktopLifetime(args);
    }
}
