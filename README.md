# CRM - Accounts module (code showcase)

Extracto **curado y de solo lectura** del módulo de **Accounts** (cuentas /
empresas) de un CRM comercial que construí para una empresa de software consulting 
y staff augmentation.  
Muestra una feature de punta a punta:
listado con filtros y búsqueda, alta y edición, la vista de detalle de una cuenta,
y un **mapa de relaciones interactivo** dibujado en canvas.

> **Esto no es la app completa ni corre por sí sola.** Es una selección de archivos
> representativos para mostrar el trabajo. Se quitaron todos los datos, secretos y
> credenciales. Varios módulos compartidos (componentes de UI, modales, el esquema
> de Prisma) se **referencian pero se omiten** a propósito.

## Lo más interesante

- **`RelationshipMapCanvas.tsx`** — un mapa de relaciones entre cuentas renderizado
  en `<canvas>`: nodos, conexiones, pan/zoom y preferencias persistidas en
  `localStorage`. Es la pieza que muestra UI compleja hecha a mano, más allá del
  CRUD.
- **Listado con filtros, búsqueda y export** (`AccountsTable`, `AccountsFilters*`,
  `AccountsSearchInput`) con la lógica de filtrado/búsqueda en utils puros
  (`app/lib/commercialFilters.ts`, `commercialSearch.ts`).
- **Detalle de cuenta** (`AccountDetailClient.tsx`) con timeline de actividad,
  relaciones y asignaciones.
- **Server actions** (`company.ts`, `relationship.ts`, `custom_delete_account.ts`):
  la lógica de negocio del lado del servidor (Next.js Server Actions).

## Stack

Next.js (App Router) · TypeScript · React · Canvas API · Server Actions · Prisma
(esquema omitido en este extracto).

## Estructura del extracto

```
app/
├── commercial/accounts/
│   ├── page.tsx                    listado (server component)
│   ├── AccountsTable.tsx           tabla
│   ├── AccountsFiltersDropdown.tsx filtros
│   ├── AccountsSearchInput.tsx     búsqueda
│   ├── AccountListClient.tsx       cliente de listado
│   ├── new/                        alta de cuenta
│   └── [id]/
│       ├── page.tsx                detalle
│       ├── AccountDetailClient.tsx vista de detalle
│       └── RelationshipMapCanvas.tsx  mapa de relaciones (canvas)
├── actions/commercial/
│   ├── company.ts                  CRUD de cuentas/empresas
│   ├── relationship.ts             relaciones entre cuentas
│   └── custom_delete_account.ts    borrado con reglas de negocio
└── lib/
    ├── commercialFilters.ts        lógica de filtrado (pura)
    ├── commercialFilterOptions.ts  opciones de filtros
    └── commercialSearch.ts         búsqueda
```

## Notas

- **Sanitizado para portfolio:** sin base de datos, sin `.env`, sin claves, sin
  datos reales.
- **Solo lectura:** pensado para leerse, no para `npm install && run` — faltan a
  propósito las dependencias compartidas del CRM.
