# Granada

Portada interactiva de estética vintage inspirada en Granada. El botón
**Empezar** queda preparado como punto de acceso a una segunda página que se
definirá en una fase posterior.

## Ejecutar en local

El proyecto usa módulos JavaScript, por lo que debe abrirse desde un servidor
HTTP en lugar de cargar `index.html` directamente con `file://`.

Por ejemplo, con Python:

```powershell
python -m http.server 8000
```

Después, abre `http://localhost:8000`.

## Estructura

- `index.html`: portada y contenido principal.
- `css/`: estilos separados por responsabilidad.
- `js/`: loader y efectos de movimiento.
- `images/`: originales de alta resolución.
- `images/optimized/`: versiones ligeras utilizadas por la portada.
