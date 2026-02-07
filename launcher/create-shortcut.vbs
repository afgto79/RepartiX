Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Chemin du script start-web.vbs
launcherDir = fso.GetParentFolderName(WScript.ScriptFullName)
startScript = launcherDir & "\start-web.vbs"
projectRoot = fso.GetParentFolderName(launcherDir)

' Chemin du bureau
desktopPath = WshShell.SpecialFolders("Desktop")

' Creation du raccourci
Set shortcut = WshShell.CreateShortcut(desktopPath & "\RepartiX.lnk")
shortcut.TargetPath = "C:\windows\system32\wscript.exe"
shortcut.Arguments = """" & startScript & """"
shortcut.WorkingDirectory = projectRoot
shortcut.Description = "RepartiX - Controle Remises Alliance Healthcare"
shortcut.WindowStyle = 1
shortcut.Save

MsgBox "Raccourci RepartiX cree sur le bureau !", vbInformation, "RepartiX"
