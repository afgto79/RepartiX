Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Chemin racine du projet (remonte d un niveau depuis launcher/)
projectRoot = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
backendPath = projectRoot & "\backend"
frontendPath = projectRoot & "\frontend"

' --- Nettoyage : tuer les anciens processus sur les ports 4000 et 4001 ---
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -ano ^| findstr :4001 ^| findstr LISTENING') do taskkill /F /PID %a 2>nul", 0, True
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do taskkill /F /PID %a 2>nul", 0, True

' Attente 1 seconde pour liberation des ports
WScript.Sleep 1000

' --- Lancement du backend (invisible, non-bloquant) ---
WshShell.Run "cmd /c cd /d """ & backendPath & """ && npm run dev", 0, False

' Attente 2 secondes pour que le backend soit pret
WScript.Sleep 2000

' --- Lancement du frontend (invisible, non-bloquant) ---
WshShell.Run "cmd /c cd /d """ & frontendPath & """ && npm run dev", 0, False

' Attente 3 secondes pour que le frontend soit pret
WScript.Sleep 3000

' --- Ouverture du navigateur ---
WshShell.Run "http://127.0.0.1:4000"
