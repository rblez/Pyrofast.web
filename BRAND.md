# Pyrofast — Marca

Paleta sacada del logo de la org: **gris, blanco, negro y naranja**.
El naranja manda en la acción; el gris en el fondo; el negro en el
texto y las superficies oscuras; el blanco en respiro.

## Colores

- Naranja principal: `#FF6A00` (botones, enlaces, acentos)
- Naranja hover: `#E85D00`
- Negro: `#0B0B0C` (texto principal, superficies oscuras)
- Gris fondo claro: `#F4F4F5`
- Gris fondo noise: `#E7E5E4` con textura de ruido encima
- Gris borde: `#D4D4D8`
- Gris texto secundario: `#71717A`
- Blanco: `#FFFFFF`

## Reglas

- **Botones naranjas**: fondo `#FF6A00`, texto blanco, hover `#E85D00`.
  El botón primario siempre es naranja; no hay botón primario gris o
  negro.
- **Fondo gris noise**: el fondo base es gris (`#F4F4F5` en claro,
  `#0B0B0C` en oscuro) con una capa de ruido sutil encima (SVG
  `feTurbulence` en data URI, opacidad ~0.04). El ruido es textura,
  no un color más.
- **Texto**: negro sobre claro, blanco sobre oscuro. Nada de texto
  naranja en párrafos: el naranja es para acción, no para lectura.

## Icons

Tres sets, cada uno en su papel:

- **Solar (Streamline)**: icons de UI principales (navegación,
  acciones, estados). Es el set por defecto en la app.
- **Lucide**: complemento cuando Solar no tiene el icono exacto.
- **SimpleIcons**: solo logos de marcas (GitHub, OpenRouter, Groq,
  Google, Anthropic, etc.), nunca para UI genérica.

No se mezclan sets para el mismo concepto: un concepto, un icono, un
set.
