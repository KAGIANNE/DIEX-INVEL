# 003 — Operación local-first

**Estado:** decisión de arquitectura para validar durante la implementación.

Las PCs de ventas, caja y administración usarán una aplicación instalada. Una PC servidor o mini-PC del local alojará la API y PostgreSQL. El router solo proporciona la red; no es la base de datos. Si se corta internet, el local continuará operando mientras el servidor y la red local estén disponibles.

Supabase no será obligatorio para la operación diaria local. Podrá recibir respaldos o cambios sincronizados cuando haya internet y permitirá acceso remoto o móvil fuera del local. La sincronización debe incluir cola de cambios, identificadores globales, reintentos, control de conflictos y registro de errores; no se debe agregar como una copia automática sin esas reglas.

Un celular conectado al mismo Wi-Fi podrá usar una interfaz móvil contra la API local. Un celular fuera del local necesitará internet y un acceso seguro mediante Supabase, VPN o un gateway. PostgreSQL nunca se expondrá directamente a internet.

El servidor deberá tener IP fija, copias automáticas, UPS y un procedimiento de restauración probado. Si el servidor se apaga, las estaciones compartidas no podrán operar hasta recuperarlo; un modo offline por estación es una fase posterior y requiere resolver conflictos.
