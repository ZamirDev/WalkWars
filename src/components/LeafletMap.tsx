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
  var userCircle = L.circle([20.0, 78.0], { radius: 15, color: '#2563eb', weight: 2, fillColor: '#2563eb', fillOpacity: 0.22 }).addTo(map);

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

function call(wv: WebView | null, fn: string, arg: unknown) {
  if (!wv) return;
  wv.injectJavaScript(`window.bridge.${fn}(${JSON.stringify(arg)}); true;`);
}

export const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(function LeafletMap(
  { style, initialLat, initialLng, polygons, onMove },
  ref
) {
  const wvRef = useRef<WebView | null>(null);

  useImperativeHandle(ref, () => ({
    setUser: (lat, lng, radius) => call(wvRef.current, 'setUser', { lat, lng, radius }),
    center: (lat, lng) => call(wvRef.current, 'setView', { lat, lng, zoom: 17 }),
  }));

  const handleMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data);
        if (msg.type === 'move' && onMove) onMove(msg.lat, msg.lng, msg.zoom);
      } catch {
        /* ignore */
      }
    },
    [onMove]
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
            call(wvRef.current, 'setView', { lat: initialLat, lng: initialLng, zoom: 17 });
          }
          call(wvRef.current, 'setTerritory', polygons);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1, backgroundColor: '#e8e8e8' },
});
