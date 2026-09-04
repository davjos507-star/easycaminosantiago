/*
 * Capa ACCESO AL ALOJAMIENTO — vista previa ESTÁTICA de cómo se llega
 * desde el Camino (o el final de etapa) hasta el alojamiento, mostrada
 * en la pantalla MAPA por defecto (sin que el peregrino tenga que pulsar
 * "Llévame al alojamiento" primero).
 *
 * ESPECIFICACIÓN (capturada 2026-09, "TRAZADO VISIBLE" — próxima fase):
 *
 * - Línea secundaria, visualmente DISTINTA de CAMINO PRINCIPAL
 *   (route-layer.js): no reutilizar el mismo color/grosor. Puede
 *   reutilizar el estilo ya validado de nav-route-layer.js (naranja
 *   #D4882A) puesto que ambas representan "acceso puntual, no Camino
 *   oficial" — a confirmar en la implementación si conviene un tercer
 *   estilo para no confundir "acceso en preview" con "navegación activa".
 * - Geometría real vía el mismo motor de routing peatonal ya en
 *   producción (accommodation/routing-service.js → netlify/functions/
 *   walking-route.js, perfil foot-walking de OpenRouteService/HeiGIT).
 *   Nunca dibujar una línea recta como si fuera la ruta a pie — si el
 *   routing falla o no es fiable, no forzar una geometría aproximada.
 * - Fallback si no hay routing fiable: mostrar el alojamiento solo como
 *   marcador (ya implementado, ver accommodation-layer.js), sin línea.
 *
 *   ⚠ CONTRADICCIÓN A RESOLVER ANTES DE IMPLEMENTAR: el encargo original
 *   de esta fase pide que, en ese caso, "el botón 'Llévame al
 *   alojamiento' abra Google Maps / Apple Maps". Eso choca directamente
 *   con el mandato explícito y ya implementado en accommodation-nav.js /
 *   map-screen.js: Osyris NO debe salir nunca de Companion, ningún botón
 *   abre Google Maps ni Apple Maps (verificado con pruebas dedicadas).
 *   No añadir ese fallback externo sin confirmación expresa — si hace
 *   falta un plan B para routing no fiable, debe ser dentro del propio
 *   mapa (marcador + distancia en línea recta claramente etiquetada como
 *   aproximada, nunca como recorrido a pie — ver regla general del
 *   proyecto), no una fuga a una app de mapas externa.
 *
 * No confundir con nav-route-layer.js: esa capa dibuja la ruta SOLO
 * mientras la navegación activa "Llévame al alojamiento" está en curso
 * (con posición GPS en vivo); esta es una vista previa estática, visible
 * sin necesidad de iniciar esa navegación.
 */
export function createAccommodationAccessLayer(mapEngine) {
  return {
    setAccess(_geojson /* ruta peatonal calculada, o null si no hay routing fiable */) {
      /* Próxima fase */
    },
    clear() {
      /* Próxima fase */
    },
  };
}
