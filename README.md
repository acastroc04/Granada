# Granada

Experiencia interactiva de estética vintage inspirada en Granada. La portada
da paso a una brújula que utiliza la ubicación y orientación del dispositivo
para recorrer una ruta de destinos secretos.

## Ejecutar en local

El proyecto usa módulos JavaScript, por lo que debe abrirse desde un servidor
HTTP en lugar de cargar `index.html` directamente con `file://`.

Por ejemplo, con Python:

```powershell
python -m http.server 8000
```

Después, abre `http://localhost:8000`.

La brújula necesita permiso de ubicación. Fuera de `localhost`, las APIs de
ubicación y orientación requieren que la web esté publicada mediante HTTPS.

El progreso de la ruta se guarda mediante `localStorage`. Es independiente en
cada navegador y dispositivo, persiste después de recargar la página y no se
envía a ningún servidor. Se pierde si el usuario borra los datos del sitio o
utiliza una sesión privada que no conserve almacenamiento.

El botón `Pista` muestra un mapa de OpenStreetMap y solicita una ruta peatonal
al servidor público de FOSSGIS. No necesita clave de API. El nombre del destino
permanece oculto, pero la ubicación actual y el punto final se envían al
servicio para poder calcular el recorrido por las calles. Cada pulsación pide
una ubicación nueva al dispositivo y recalcula desde cero la siguiente calle.

## Estructura

- `index.html`: portada y contenido principal.
- `css/`: estilos separados por responsabilidad.
- `js/`: loader y efectos de movimiento.
- `js/experience.js`: transición, geolocalización y cálculo del rumbo.
- `localizaciones.txt`: destinos de la ruta en orden, uno por línea, con el
  formato `Nombre:latitud,longitud`.
- `images/`: originales de alta resolución.
- `images/optimized/`: versiones ligeras utilizadas por la portada.
