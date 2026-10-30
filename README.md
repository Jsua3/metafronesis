# Metafrónesis · backend del simulador de psicología social (antes llamado SIEP)

Backend en Django del simulador de casos situacionales de psicología social. Este repositorio se construye **por sprints**, cada uno a cargo de una persona del equipo, y cada sprint deja una versión etiquetada.

> **Origen del proyecto:** el desarrollo previo vive en [`Jsua3/psico_project_v2`](https://github.com/Jsua3/psico_project_v2),dentro del cual vive una version mejorada de lo que fue el ganador a mejor proyecto nuclear 3er semestre. Tal repositorio queda como archivo de solo lectura  . Este repositorio reorganiza y continúa ese trabajo con el equipo completo.


## Equipo

| Persona | Sprint | Bloque |
|---|---|---|
| Emerson Ángel Gómez (`@EmersonAngel`) | A | Base y autenticación (`psychosim`, `users`) |
| Santiago Leyton (`@SantiagoLeyton`) | B | Plataforma transversal (`shared`, `security`) |
| Juan José Sua Gómez (`@Jsua3`) | C | Privacidad y grupos (`privacy`, `grupos`) |
| Esteban Bonilla Giraldo (`@estebanbonilla22`) | D | Núcleo de la simulación (`simulation`) |

## Avance por sprint

| Versión | Contenido | Estado |
|---|---|---|
| `v0.1.0` | Base, autenticación y plataforma transversal (A + B) | pendiente |
| `v0.2.0` | Privacidad y grupos (C) | pendiente |
| `v0.3.0` | Caso, intento y API básica (D) | pendiente |
| `v0.4.0` | Motor de decisiones y evaluación mínima (D) | pendiente |

Alcance acordado: backend al 40 % o más. El detalle de cada sprint está en `docs/sprints/`.

## Cómo ejecutarlo

Se completa en el sprint 1, cuando exista la configuración base:

```bash
python -m venv .venv
# activar el entorno y luego:
pip install -r requirements.txt
cp .env.example .env     # completar los valores localmente
python manage.py migrate
python manage.py runserver
```

## Flujo de trabajo

Ver [CONTRIBUTING.md](CONTRIBUTING.md): Git Flow (`main`, `develop`, `feature/*`), Pull Request con revisión cruzada y Conventional Commits.

## Licencia

Pendiente de definir por el equipo.
