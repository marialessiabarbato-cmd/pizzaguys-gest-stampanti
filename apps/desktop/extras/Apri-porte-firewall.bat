@echo off
:: Eseguire con clic destro -> "Esegui come amministratore" (una volta, e di nuovo dopo ogni aggiornamento).
:: Apre sulla rete locale le porte usate da Pizza Guys:
::   TCP 4100 (Edge), 5173 (cassa), 5174 (palmare), 5175 (KDS)
::   UDP 5353 (nome "pizzaguys-cassa.local": i telefoni trovano la cassa anche se cambia indirizzo)
netsh advfirewall firewall delete rule name="Pizza Guys" >nul 2>&1
netsh advfirewall firewall delete rule name="Pizza Guys - nome in rete" >nul 2>&1
netsh advfirewall firewall add rule name="Pizza Guys" dir=in action=allow protocol=TCP localport=4100,5173,5174,5175 profile=private,domain
netsh advfirewall firewall add rule name="Pizza Guys - nome in rete" dir=in action=allow protocol=UDP localport=5353 profile=private,domain
echo.
echo Fatto. Ora puoi aprire "Pizza Guys.exe".
echo Se i telefoni non si collegano: in Impostazioni di Windows la rete del locale deve essere "Privata".
pause
