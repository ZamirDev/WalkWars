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
  onMove?: (lat: number, lng: number, zoom: number) => void;
}

export interface LeafletMapHandle {
  setUser: (lat: number, lng: number, radius: number) => void;
  center: (lat: number, lng: number) => void;
  fitTo: (pts: LatLng[]) => void;
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
  .user-dot{position:absolute;top:4px;left:4px;width:16px;height:16px;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,0.35);}
  .user-pulse{position:absolute;top:4px;left:4px;width:16px;height:16px;border-radius:50%;background:rgba(37,99,235,0.45);animation:wwpulse 2s ease-out infinite;}
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
    icon: L.divIcon({ className: 'user-icon', html: '<div class="user-pulse"></div><div class="user-dot"></div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
    zIndexOffset: 1000
  });

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
      if (!userShown) {
        userShown = true;
        userMarker.addTo(map);
        userCircle.addTo(map);
      }
      wvLog('setUser ' + pos.lat.toFixed(5) + ',' + pos.lng.toFixed(5));
    },
    setTerritory: function (polygons) {
      layer.clearLayers();
      (polygons || []).forEach(function (p) {
        L.polygon(p.ring, { color: p.color, weight: 1.5, fillColor: p.color, fillOpacity: 0.45 }).addTo(layer);
      });
    },
    setTrail: function (path) {
      trailLayer.clearLayers();
      var pts = (path || []).map(function (p) { return [p.lat, p.lng]; });
      if (pts.length < 2) return;
      var closed = pts.length > 4 &&
        Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 0.00006 &&
        Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 0.00006;
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
    }
  };
  window.bridge = bridge;
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
</script>
</body>
</html>`;

export const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(function LeafletMap(
  { style, initialLat, initialLng, polygons, trail, onMove },
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
      setUser: (lat, lng, radius) => call('setUser', { lat, lng, radius }),
      center: (lat, lng) => call('setView', { lat, lng, zoom: 17 }),
      fitTo: (pts) => call('fitBounds', pts),
    }),
    [call]
  );

  const flushPending = useCallback(() => {
    const q = pendingRef.current;
    pendingRef.current = [];
    for (const fn of q) fn();
  }, []);

  useEffect(() => {
    call('setTrail', trail ?? []);
  }, [trail, call]);

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
          call('setTrail', trail ?? []);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1, backgroundColor: '#e8e8e8' },
});
