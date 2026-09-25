# Granada

Experiencia interactiva de estética vintage inspirada en Granada. La portada
da paso a una brújula que utiliza la ubicación y orientación del dispositivo
para señalar hacia la Alhambra.

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

## Estructura

- `index.html`: portada y contenido principal.
- `css/`: estilos separados por responsabilidad.
- `js/`: loader y efectos de movimiento.
- `js/experience.js`: transición, geolocalización y cálculo del rumbo.
- `images/`: originales de alta resolución.
- `images/optimized/`: versiones ligeras utilizadas por la portada.
