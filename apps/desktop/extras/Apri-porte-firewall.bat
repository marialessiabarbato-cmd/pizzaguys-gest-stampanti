@echo off
:: Eseguire con clic destro -> "Esegui come amministratore".
:: Apre le porte usate da Pizza Guys sulla rete locale (Edge 4100, cassa 5173, palmare 5174, KDS 5175).
netsh advfirewall firewall delete rule name="Pizza Guys" >nul 2>&1
netsh advfirewall firewall add rule name="Pizza Guys" dir=in action=allow protocol=TCP localport=4100,5173,5174,5175 profile=private,domain
echo.
echo Fatto. Ora puoi aprire "Pizza Guys.exe".
pause
