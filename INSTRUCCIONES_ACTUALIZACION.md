# Lavadero eLeGe — Proyecto completo (12/11/2026)

Este ZIP incluye el proyecto completo de la versión `EleGe-main.zip` proporcionada, con la integración del borrador por voz/texto y el asistente. No es un parche.

## Instalación segura (Windows)

1. Cerrá el servidor de desarrollo, hacé copia de seguridad de la carpeta EleGe y sus datos. **No borres `.env.local` ni la carpeta `.git`**: no están incluidos en este ZIP.
2. Descomprimí el ZIP en **una carpeta nueva** `EleGe-prueba` y copiá tu `.env.local` existente a esa carpeta (si ya usabas Firebase local).
3. En CMD: `cd /d "RUTA\EleGe-prueba"`, luego `npm ci`, `npx tsc --noEmit`, `npm run build` y `npm run dev`.
4. Probá la autenticación en incógnito: las contraseñas incorrectas deben rechazarse; solo debe entrar el UID de administradora autorizado.
5. En **Nuevo pedido**, probá la carga hablada: `Cliente María González, teléfono 3471555555, dos acolchados de dos plazas a 12000 cada uno, seña de 10000 en efectivo, entrega 15/11/2026`. Revisá el borrador y confirmá manualmente.
6. Comprobá que funcione alta de cliente, creación manual de pedido, señas, lista de pedidos, QR y caja. Probalo en Chrome Android con permiso de micrófono.

## Funcionamiento

- El micrófono usa el reconocimiento del navegador. Puede necesitar conexión a Internet y autorización del usuario; no funciona en todos los navegadores.
- La interpretación es mediante reglas locales para frases habituales, **no mediante IA**. Puede no reconocer nombres, prendas o números complejos. Un dato dudoso debe completarse manualmente.
- **No guarda un pedido o cliente por hablar**. Abre y completa un borrador editable; el guardado exige confirmación manual.
- No modifica las reglas de Firestore ni migra automáticamente el almacenamiento local a la nube. La aplicación base utiliza almacenamiento local; **no asumas sincronización entre teléfonos/PC**.
- Se retiró la autenticación de previsualización que permitía el acceso con una contraseña arbitraria.
- **No subas a GitHub ni publiques en Vercel antes de probar las funciones importantes.**

## Verificación

La comprobación final `npm ci` / `npm run build` no pudo completarse en este entorno porque las dependencias nativas del bundler no estaban disponibles; ejecutalas en tu PC antes de reemplazar el proyecto en producción.
