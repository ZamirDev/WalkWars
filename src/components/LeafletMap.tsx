import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { TerritoryPolygon } from '@/lib/types';

interface LeafletMapProps {
  style?: StyleProp<ViewStyle>;
  initialLat?: number;
  initialLng?: number;
  polygons: TerritoryPolygon[];
  onMove?: (lat: number, lng: number, zoom: number) => void;
}

export interface LeafletMapHandle {
  setUser: (lat: number, lng: number, radius: number) => void;
  center: (lat: number, lng: number) => void;
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
  var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([20.0, 78.0], 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var userCircle = L.circle([20.0, 78.0], { radius: 15, color: '#2563eb', weight: 2, fillColor: '#2563eb', fillOpacity: 0.15, dashArray: '4 4' }).addTo(map);
  var userMarker = L.marker([20.0, 78.0], {
    icon: L.divIcon({ className: 'user-icon', html: '<div class="user-pulse"></div><div class="user-dot"></div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
    zIndexOffset: 1000
  }).addTo(map);

  function emitMove() {
    var c = map.getCenter();
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'move', lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
  }
  map.on('moveend', emitMove);

  var bridge = {
    setView: function (lat, lng, zoom) {
      map.setView([lat, lng], zoom || map.getZoom());
    },
    setUser: function (lat, lng, radius) {
      userMarker.setLatLng([lat, lng]);
      userCircle.setLatLng([lat, lng]);
      if (radius) userCircle.setRadius(radius);
    },
    setTerritory: function (polygons) {
      layer.clearLayers();
      (polygons || []).forEach(function (p) {
        L.polygon(p.ring, { color: p.color, weight: 1.5, fillColor: p.color, fillOpacity: 0.45 }).addTo(layer);
      });
    }
  };
  window.bridge = bridge;
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
</script>
</body>
</html>`;

export const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(function LeafletMap(
  { style, initialLat, initialLng, polygons, onMove },
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
    }),
    [call]
  );

  const flushPending = useCallback(() => {
    const q = pendingRef.current;
    pendingRef.current = [];
    for (const fn of q) fn();
  }, []);

  const handleMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data);
        if (msg.type === 'ready') {
          readyRef.current = true;
          flushPending();
        } else if (msg.type === 'move' && onMove) {
          onMove(msg.lat, msg.lng, msg.zoom);
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
        onLoadEnd={() => {
          if (initialLat != null && initialLng != null) {
            call('setView', { lat: initialLat, lng: initialLng, zoom: 17 });
          }
          call('setTerritory', polygons);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1, backgroundColor: '#e8e8e8' },
});
