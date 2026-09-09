using System;
using System.Diagnostics;

internal static class WmicCompat
{
    public static void Main()
    {
        Console.WriteLine("Name ProcessId ParentProcessId Status");
        foreach (var process in Process.GetProcesses())
        {
            try
            {
                Console.WriteLine(string.Format("{0}.exe {1} 0 Running", process.ProcessName, process.Id));
            }
            catch
            {
                // A process may exit while the list is being read.
            }
            finally
            {
                process.Dispose();
            }
        }
    }
}
