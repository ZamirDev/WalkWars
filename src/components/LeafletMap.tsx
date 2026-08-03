import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { LatLng } from '@/lib/geo';
import type { TerritoryPolygon } from '@/lib/types';

interface LeafletMapProps {
  style?: StyleProp<ViewStyle>;
  initialLat?: number;
  initialLng?: number;
  polygons: TerritoryPolygon[];
  trail?: LatLng[];
  trailClosed?: boolean;
  onMove?: (lat: number, lng: number, zoom: number) => void;
}

export interface LeafletMapHandle {
  setUser: (lat: number, lng: number, radius: number, heading?: number) => void;
  center: (lat: number, lng: number) => void;
  fitTo: (pts: LatLng[]) => void;
  celebrate: (ring: LatLng[]) => void;
}

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map{height:100%;margin:0;padding:0;}
  .user-icon{background:transparent;}
  .user-wrap{position:absolute;top:0;left:0;width:24px;height:24px;}
  .user-arrow{position:absolute;top:5px;left:5px;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:14px solid #2563eb;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35));transition:transform .15s ease-out;}
  .user-ring{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:rgba(37,99,235,0.18);border:1px solid rgba(37,99,235,0.35);}
  .user-pulse{position:absolute;top:6px;left:6px;width:12px;height:12px;border-radius:50%;background:rgba(37,99,235,0.45);animation:wwpulse 2s ease-out infinite;}
  @keyframes wwpulse{0%{transform:scale(1);opacity:.8;}100%{transform:scale(3.2);opacity:0;}}
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([20, 0], 2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var trailLayer = L.layerGroup().addTo(map);
  var userShown = false;
  var userCircle = L.circle([0, 0], { radius: 15, color: '#2563eb', weight: 2, fillColor: '#2563eb', fillOpacity: 0.15, dashArray: '4 4' });
  var userMarker = L.marker([0, 0], {
    icon: L.divIcon({ className: 'user-icon', html: '<div class="user-wrap"><div class="user-ring"></div><div class="user-pulse"></div><div class="user-arrow"></div></div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
    zIndexOffset: 1000
  });

  function setUserHeading(deg) {
    var el = userMarker.getElement();
    if (!el) return;
    var arrow = el.querySelector('.user-arrow');
    if (arrow && deg != null && isFinite(deg)) arrow.style.transform = 'rotate(' + deg + 'deg)';
  }

  function emitMove() {
    var c = map.getCenter();
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'move', lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
  }
  map.on('moveend', emitMove);

  function wvLog(s) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', msg: s }));
  }

  var bridge = {
    setView: function (pos) {
      var lat = pos.lat, lng = pos.lng;
      var zoom = Math.round(pos.zoom || 17);
      map.setView([lat, lng], zoom, { animate: false });
      if (Math.round(map.getZoom()) !== zoom) map.setZoom(zoom);
      wvLog('setView ' + lat.toFixed(5) + ',' + lng.toFixed(5) + ' z=' + map.getZoom());
    },
    setUser: function (pos) {
      userMarker.setLatLng([pos.lat, pos.lng]);
      userCircle.setLatLng([pos.lat, pos.lng]);
      if (pos.radius) userCircle.setRadius(pos.radius);
      setUserHeading(pos.heading);
      if (!userShown) {
        userShown = true;
        userMarker.addTo(map);
        userCircle.addTo(map);
      }
      wvLog('setUser ' + pos.lat.toFixed(5) + ',' + pos.lng.toFixed(5) + ' h=' + (pos.heading != null ? Math.round(pos.heading) : '-'));
    },
    setTerritory: function (polygons) {
      layer.clearLayers();
      (polygons || []).forEach(function (p) {
        L.polygon(p.ring, { color: p.color, weight: 1.5, fillColor: p.color, fillOpacity: 0.45 }).addTo(layer);
      });
    },
    setTrail: function (arg) {
      trailLayer.clearLayers();
      var pts = (arg.path || []).map(function (p) { return [p.lat, p.lng]; });
      if (pts.length < 2) return;
      var closed = !!arg.closed;
      L.polyline(pts, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.85,
        dashArray: closed ? null : '6 8',
        lineJoin: 'round'
      }).addTo(trailLayer);
      if (closed) {
        L.circle(pts[0], { radius: 5, color: '#16a34a', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }).addTo(trailLayer);
      }
      wvLog('setTrail ' + pts.length + ' pts' + (closed ? ' CLOSED' : ''));
    },
    fitBounds: function (pts) {
      if (!pts || pts.length < 2) return;
      map.fitBounds(
        L.latLngBounds(pts.map(function (p) { return [p.lat, p.lng]; })),
        { padding: [48, 48], maxZoom: 16 }
      );
      wvLog('fitBounds ' + pts.length + ' pts z=' + map.getZoom());
    },
    celebrateTerritory: function (pos) {
      var ring = (pos && pos.ring) || [];
      if (ring.length < 3) return;
      var pol = L.polygon(ring, { color: '#16a34a', weight: 5, fillColor: '#16a34a', fillOpacity: 0.65 }).addTo(layer);
      var start = null;
      function step(ts) {
        if (!start) start = ts;
        var t = (ts - start) / 1000;
        if (t > 2.4) { layer.removeLayer(pol); return; }
        var f = (t % 0.8) / 0.8;
        var pulse = Math.sin(Math.PI * f);
        pol.setStyle({ fillOpacity: 0.25 + 0.45 * pulse, opacity: 0.35 + 0.55 * f, weight: 4 + 8 * pulse });
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      wvLog('celebrateTerritory ' + ring.length + ' pts');
    }
  };
  window.bridge = bridge;
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
</script>
</body>
</html>`;

export const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(function LeafletMap(
  { style, initialLat, initialLng, polygons, trail, trailClosed, onMove },
  ref
) {
  const wvRef = useRef<WebView | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<(() => void)[]>([]);
  const call = useCallback((fn: string, arg: unknown) => {
    const wv = wvRef.current;
    if (!wv) return;
    const js = `window.bridge.${fn}(${JSON.stringify(arg)}); true;`;
    if (readyRef.current) {
      wv.injectJavaScript(js);
    } else {
      pendingRef.current.push(() => wv.injectJavaScript(js));
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setUser: (lat, lng, radius, heading) => call('setUser', { lat, lng, radius, heading }),
      center: (lat, lng) => call('setView', { lat, lng, zoom: 17 }),
      fitTo: (pts) => call('fitBounds', pts),
      celebrate: (ring) => call('celebrateTerritory', { ring }),
    }),
    [call]
  );

  const flushPending = useCallback(() => {
    const q = pendingRef.current;
    pendingRef.current = [];
    for (const fn of q) fn();
  }, []);

  useEffect(() => {
    call('setTrail', { path: trail ?? [], closed: trailClosed ?? false });
  }, [trail, trailClosed, call]);

  useEffect(() => {
    call('setTerritory', polygons);
  }, [polygons, call]);

  const handleMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data);
        if (msg.type === 'ready') {
          readyRef.current = true;
          flushPending();
        } else if (msg.type === 'move' && onMove) {
          onMove(msg.lat, msg.lng, msg.zoom);
        } else if (msg.type === 'log') {
          console.log('[walkwars] wv', msg.msg);
        }
      } catch {
        /* ignore */
      }
    },
    [onMove, flushPending]
  );

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={wvRef}
        originWhitelist={['*']}
        source={{ html: MAP_HTML }}
        style={styles.map}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        onLoadStart={() => {
          readyRef.current = false;
        }}
        onLoadEnd={() => {
          if (initialLat != null && initialLng != null) {
            call('setView', { lat: initialLat, lng: initialLng, zoom: 17 });
          }
          call('setTerritory', polygons);
          call('setTrail', { path: trail ?? [], closed: trailClosed ?? false });
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1, backgroundColor: '#e8e8e8' },
});
