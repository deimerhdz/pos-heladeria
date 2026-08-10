# «Días del mes» en promociones: para qué sirve, si funciona y si conviene dejarlo

Análisis del parámetro `days_of_month` del formulario de promociones (bloque **Más opciones**), a
petición de: *¿qué utilidad tiene, qué casos de uso justifica dejarlo, y los valores llegan de
verdad al backend?*

---

## 1. Qué es

`days_of_month` restringe una promoción a **días concretos del calendario**: «solo el 15 y el 30 de
cada mes». Es una de las cinco dimensiones de vigencia que tiene una promoción, y son
independientes entre sí:

| Dimensión | Campo | Ejemplo |
|---|---|---|
| Rango de fechas | `starts_at` / `ends_at` | del 1 al 31 de agosto |
| Día de la semana | `days_of_week` | los martes |
| **Día del mes** | **`days_of_month`** | **el 15 y el 30** |
| Franja horaria | `start_time` / `end_time` | de 5 a 7 p. m. |
| Cantidad mínima | `min_qty` | comprando 2 o más |

---

## 2. ¿Los valores llegan al backend? **Sí, el recorrido completo funciona**

Verificado extremo a extremo sobre el código actual:

1. **Formulario → payload.** El array `number[]` del formulario se serializa a CSV ordenado y sin
   duplicados en `daysToStr()`, y viaja en `toScalars()` — que alimenta **tanto `POST /promotions`
   como `PATCH /promotions/{id}`**.
   → [promotion.service.ts:262](src/app/modules/promotions/services/promotion.service.ts#L262)

   Si no hay días seleccionados se envía `null` explícito, que es como el backend entiende «no
   restringe». Enviar el `null` importa: el backend usa `model_fields_set`, así que omitir el campo
   dejaría el valor viejo y no habría forma de *quitar* la restricción una vez puesta.

2. **Validación en el backend.** `_validate_csv(value, 1, 31, …)` exige enteros 1..31, los ordena y
   deduplica. Un valor basura no se guarda en silencio: responde 422.
   → `pos-backend/app/api/v1/promotions/schemas.py:23-38`

3. **Persistencia.** Columna `days_of_month VARCHAR(100)`. Los 31 días como CSV ocupan 83
   caracteres, así que **cabe cualquier combinación**; no hay riesgo de truncado.
   → `pos-backend/app/models/promotion.py:76`

4. **Evaluación en la venta.** `_valid_now()` compara `str(now.day)` contra el conjunto permitido.
   Aplica en los cuatro caminos de cobro, en el menú QR y en los combos.
   → `pos-backend/app/api/v1/promotions/service.py:104-107`

5. **Réplica en el cliente.** `isPromoActiveNow()` hace la misma comprobación para las insignias de
   descuento del POS, y `csvOverlap()` la usa para detectar solapamientos.
   → [promotion-pricing.util.ts](src/app/modules/promotions/services/promotion-pricing.util.ts)

**Conclusión: el dato se envía, se valida, se guarda y se respeta en el cobro.** No es un campo
decorativo.

---

## 3. Las tres reglas que hay que entender antes de usarlo

### 3.1 Todas las dimensiones se combinan con **Y**, no con **O**

`_valid_now()` es una cadena de condiciones: la promoción aplica solo si se cumplen **todas**.

> «Los viernes» + «el 15 y el 30» **no** significa «los viernes o los días de pago».
> Significa **solo un 15 o un 30 que además caiga en viernes** — puede pasar un año entero sin que
> se active.

Es la trampa más fácil de este campo y no hay nada en la interfaz que la advierta.

### 3.2 Se evalúa en hora local del negocio, no del navegador

El backend evalúa en `TENANT_TIMEZONE` (`America/Bogota` por defecto). El «día 15» empieza a las
00:00 de Colombia. La vista previa del formulario usa la hora del navegador: para un administrador
que viaje, ambas pueden discrepar unas horas.

### 3.3 Los días 29, 30 y 31 no existen todos los meses

| Día | Meses en que existe |
|---|---|
| 31 | 7 de 12 (ene, mar, may, jul, ago, oct, dic) |
| 30 | 11 de 12 (falta febrero) |
| 29 | 12 de 12, pero febrero solo en año bisiesto |

El formulario ya avisa del caso del 31
([promotions-page.component.ts:1448](src/app/modules/promotions/pages/promotions-page.component.ts#L1448)).

---

## 4. Casos de uso que lo justifican

### El fuerte: **quincena** (el que motiva el preset)

En Colombia el pago de nómina cae el 15 y el 30. Es el patrón de consumo más marcado del mes y **no
se puede expresar con ninguna otra dimensión**: no es un día de la semana fijo ni un rango de
fechas, se repite mes a mes indefinidamente.

> «10% en malteadas los días de pago» → `days_of_month = 15,30`, sin fecha de fin.
> Se configura una vez y corre para siempre.

Sin este campo, la alternativa es crear una promoción con `starts_at`/`ends_at` **cada mes, a mano,
para siempre**. Eso es trabajo recurrente que nadie sostiene.

### Otros usos reales

- **Día del cliente / aniversario mensual**: «el día 7 de cada mes, 2x1 en conos».
- **Fechas de marca**: si el negocio abrió un día 3, «el 3 de cada mes» como recordatorio comercial.
- **Rotación de inventario**: «el 28, 29 y 30, 15% en toppings» para bajar existencias antes del
  corte de mes.
- **Descongestionar días flojos** que caen siempre en la misma fecha por convenios locales.

### Cuándo *no* usarlo

- Para un evento de una sola vez → usa `starts_at`/`ends_at`.
- Para un patrón semanal («los martes») → usa días de la semana, no días del mes.
- Combinado con días de la semana, salvo que entiendas la regla **Y** del punto 3.1.

---

## 5. Problemas detectados

### 🔴 P1 — La vista previa y la lista mienten

`vigPhrase()` construye la frase de vigencia a partir de días de la semana, horario y fechas, pero
**ignora `days_of_month`**. Su tipo de entrada `VigInput` ni siquiera declara el campo.

→ [promotions-page.component.ts:96-102](src/app/modules/promotions/pages/promotions-page.component.ts#L96-L102)
y [promotions-page.component.ts:2093-2101](src/app/modules/promotions/pages/promotions-page.component.ts#L2093-L2101)

Efecto concreto: una promoción restringida al 15 y al 30 muestra

> Se aplicará: **Todos los días, sin horario ni fecha límite**

tanto en el recuadro de vista previa del formulario como en la columna **Vigencia** de la lista. El
administrador configura la restricción, la guarda correctamente, y la interfaz le dice que no
existe. Es el peor de los dos mundos: el dato sí llega al backend, así que la promoción **no**
aplicará los otros 29 días, pero nada en pantalla lo explica.

Es un defecto de la propia interfaz, no del parámetro. **Es la razón principal por la que hoy este
campo parece inútil.**

### 🟠 P2 — El preset «Fin de mes» no hace lo que dice

`applyDaysOfMonthPreset([31])` añade **el día 31**, no «el fin de mes».
→ [promotions-page.component.ts:1406](src/app/modules/promotions/pages/promotions-page.component.ts#L1406)

En febrero, abril, junio, septiembre y noviembre esa promoción **nunca se activa**: 5 de 12 meses
muertos. Quien pulsa el botón espera «el último día del mes, sea cual sea».

El modelo de datos no soporta «último día» (solo números fijos), así que la corrección honesta es
renombrar el preset a **«Día 31»** o cambiarlo por **«Últimos días (28, 29, 30, 31)»**, que cubre
todos los meses a costa de activarse hasta cuatro días seguidos.

### 🟡 P3 — Está enterrado en «Más opciones»

El caso de uso más valioso (quincena) vive tras un enlace que hay que descubrir. Si el negocio
quiere promociones de día de pago, es el primer sitio donde debería mirar, no el último.

---

## 6. Recomendación

**Dejarlo.** El campo funciona de punta a punta, cubre un patrón comercial real —la quincena— que
ninguna otra dimensión puede expresar, y quitarlo obligaría a crear promociones a mano cada mes.
Además, eliminarlo del formulario no lo borraría del backend: la columna, el validador y la
evaluación seguirían ahí, así que solo se perdería la forma de configurarlo.

Ahora bien, **hoy no está aportando lo que puede**, y el motivo es P1: la interfaz no muestra la
restricción que el usuario acaba de configurar. Por orden de impacto:

1. **Incluir `days_of_month` en `vigPhrase()`** para que la vista previa y la columna Vigencia digan
   «los días 15 y 30 de cada mes». Sin esto, el campo es una trampa. *(cambio pequeño y contenido)*
2. **Renombrar o rehacer el preset «Fin de mes»**, que hoy falla 5 meses al año.
3. **Advertir de la combinación Y** cuando haya días de la semana **y** días del mes seleccionados a
   la vez: «Solo se aplicará cuando un día 15 o 30 caiga en viernes».
4. *(opcional)* Sacar el preset **Quincena** del bloque avanzado y ponerlo junto a «Fines de semana»
   y «Happy hour», que es donde el usuario lo busca.

Los puntos 1 a 3 son correcciones de interfaz; ninguno toca el backend ni el modelo de datos.

---

## 7. Decisión final: se retiró el campo

**El campo se eliminó.** La recomendación de la sección 6 era conservarlo y arreglar la interfaz; la
decisión fue la contraria, y el criterio es defendible: los tres problemas de la sección 5 no se
resuelven con un solo cambio, sino con cuatro correcciones —vista previa, preset, aviso de la
combinación **Y** y colocación— que hay que sostener después. El único caso de uso que lo justificaba
(la quincena) no compensa esa superficie.

Lo que se hizo:

- **Backend**: migración `f1a2b3c4d5e6_drop_promotion_days_of_month` con `DROP COLUMN` en cada schema
  de tenant, más la salida del campo de `Promotion`, de los tres schemas de Pydantic, de `_valid_now`
  y de `find_overlaps`. Se conservan `_validate_csv` y `_csv_overlap`, que siguen sirviendo a
  `days_of_week`.
- **Frontend**: fuera de las interfaces, del payload, de `isPromoActiveNow`, de `findOverlaps`, del
  bloque «Más opciones» del asistente y del aviso de vigencia de `combo-select`.

Verificado: `alembic upgrade → downgrade → upgrade` sobre los tres tenants sin filas afectadas (la
columna estaba en `NULL` en todos), `test_promotions_rules` en verde, `ng build` limpio y los 20
specs de `promotion-pricing.util` pasando.

**Lo que cambia para el negocio:** una promoción ya no puede restringirse a fechas del calendario.
Las tres dimensiones que quedan —rango de fechas, día de la semana y franja horaria— cubren el resto
de los casos. Para algo como «10% los días de pago» ahora hay que crear una promoción con
`starts_at`/`ends_at` cada mes, a mano; si eso llega a doler, el camino de vuelta es el `downgrade`
de la migración más revertir los cambios de código, no una implementación nueva.
