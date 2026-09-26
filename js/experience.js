/**
 * Transición desde la portada y brújula para una ruta secreta por Granada.
 * Los destinos se cargan desde localizaciones.txt y sólo se revela su nombre
 * cuando el visitante se encuentra a diez metros o menos.
 */

const UPDATE_INTERVAL = 3000;
const ARRIVAL_DISTANCE_METRES = 10;
const ORIENTATION_SMOOTHING = 0.22;
const PROGRESS_STORAGE_KEY = 'granada-route-progress-v1';
const TO_RADIANS = Math.PI / 180;
const TO_DEGREES = 180 / Math.PI;
const GRANADA_CENTRE = { latitude: 37.1773, longitude: -3.5986 };

let locations = [];
let locationsPromise;
let currentDestinationIndex = 0;
let locationTimer;
let locationRequestInProgress = false;
let isTracking = false;
let routePhase = 'idle';
let trackingGeneration = 0;
let pendingArrival = null;
let destinationBearing = 0;
let smoothedHeading = null;
let needleRotation = 0;
let orientationFrame;
let completedLocationIds = new Set();
let hintMap;
let hintMapLayers;
let hintMapResizeObserver;
let lastKnownPosition;

function normaliseDegrees(value) {
  return (value + 360) % 360;
}

function shortestAngle(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function parseCoordinate(rawCoordinate) {
  const coordinate = rawCoordinate.trim();
  const decimalMatch = coordinate.match(/^(-?\d+(?:\.\d+)?)$/);
  if (decimalMatch) return Number(decimalMatch[1]);

  // Accept degree/minute/second separators without depending on a specific
  // quote character or console encoding (37°10'34.5"N, for example).
  const dmsMatch = coordinate.match(/^(\d+(?:\.\d+)?)[^\d.]+(\d+(?:\.\d+)?)[^\d.]+(\d+(?:\.\d+)?)[^NSEW]*([NSEW])$/i);
  if (!dmsMatch) return Number.NaN;

  const [, degrees, minutes, seconds, direction] = dmsMatch;
  const decimal = Number(degrees) + Number(minutes) / 60 + Number(seconds) / 3600;
  return /[SW]/i.test(direction) ? -decimal : decimal;
}

function parseLocations(text) {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const cleanLine = line.trim();
    if (!cleanLine) return [];

    const separator = cleanLine.indexOf(':');
    const coordinates = separator === -1 ? [] : cleanLine.slice(separator + 1).split(',');
    const name = separator === -1 ? '' : cleanLine.slice(0, separator).trim();
    const latitude = parseCoordinate(coordinates[0] || '');
    const longitude = parseCoordinate(coordinates[1] || '');

    if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      console.warn(`Localización ignorada en la línea ${index + 1}: formato incorrecto.`);
      return [];
    }

    return [{ name, latitude, longitude }];
  });
}

function getLocationId(location) {
  return `${location.name}|${location.latitude.toFixed(6)}|${location.longitude.toFixed(6)}`;
}

function loadProgress() {
  try {
    const savedProgress = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) || '{}');
    const savedIds = Array.isArray(savedProgress.completedLocationIds)
      ? savedProgress.completedLocationIds
      : [];
    completedLocationIds = new Set(savedIds);
    pendingArrival = savedProgress.pendingArrival || null;
  } catch {
    // If storage is unavailable or corrupt, the route safely starts again.
    completedLocationIds = new Set();
    pendingArrival = null;
  }

  const firstPendingIndex = locations.findIndex(
    (location) => !completedLocationIds.has(getLocationId(location))
  );
  currentDestinationIndex = firstPendingIndex === -1 ? locations.length : firstPendingIndex;

  if (pendingArrival) {
    const arrivedLocation = locations.find(
      (location) => getLocationId(location) === pendingArrival.locationId
    );

    if (!arrivedLocation || !completedLocationIds.has(pendingArrival.locationId)) {
      pendingArrival = null;
      persistProgress();
    } else {
      pendingArrival.name = arrivedLocation.name;
      pendingArrival.isFinal = locations.every(
        (location) => completedLocationIds.has(getLocationId(location))
      );
    }
  }
}

function persistProgress() {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({
      completedLocationIds: [...completedLocationIds],
      pendingArrival,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // The current session can continue even when private storage is blocked.
  }
}

function saveCompletedLocation(location, isFinal) {
  completedLocationIds.add(getLocationId(location));
  pendingArrival = {
    locationId: getLocationId(location),
    name: location.name,
    isFinal,
  };
  persistProgress();
}

function clearSavedProgress() {
  completedLocationIds = new Set();
  currentDestinationIndex = 0;
  pendingArrival = null;
  routePhase = 'idle';

  try {
    localStorage.removeItem(PROGRESS_STORAGE_KEY);
  } catch {
    // The in-memory reset is still useful when storage is unavailable.
  }
}

async function loadLocations() {
  const response = await fetch(new URL('../localizaciones.txt', import.meta.url));
  if (!response.ok) throw new Error(`No se pudo cargar localizaciones.txt (${response.status})`);

  const parsedLocations = parseLocations(await response.text());
  if (!parsedLocations.length) throw new Error('localizaciones.txt no contiene destinos válidos');
  locations = parsedLocations;
  loadProgress();
}

function calculateBearing(latitude, longitude, destination) {
  const latitudeFrom = latitude * TO_RADIANS;
  const latitudeTo = destination.latitude * TO_RADIANS;
  const longitudeDelta = (destination.longitude - longitude) * TO_RADIANS;
  const y = Math.sin(longitudeDelta) * Math.cos(latitudeTo);
  const x = Math.cos(latitudeFrom) * Math.sin(latitudeTo)
    - Math.sin(latitudeFrom) * Math.cos(latitudeTo) * Math.cos(longitudeDelta);

  return normaliseDegrees(Math.atan2(y, x) * TO_DEGREES);
}

function calculateDistanceMetres(latitude, longitude, destination) {
  const earthRadiusMetres = 6371000;
  const latitudeDelta = (destination.latitude - latitude) * TO_RADIANS;
  const longitudeDelta = (destination.longitude - longitude) * TO_RADIANS;
  const latitudeFrom = latitude * TO_RADIANS;
  const latitudeTo = destination.latitude * TO_RADIANS;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeFrom) * Math.cos(latitudeTo)
    * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMetres * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(distanceMetres) {
  if (distanceMetres < 1000) return `${Math.round(distanceMetres)} m para llegar`;
  const kilometres = distanceMetres / 1000;
  return `${kilometres.toFixed(kilometres < 10 ? 1 : 0)} km para llegar`;
}

function rotateNeedle() {
  if (routePhase !== 'tracking') return;
  const needle = document.getElementById('compass-needle');
  if (!needle) return;

  const targetRotation = normaliseDegrees(destinationBearing - (smoothedHeading || 0));
  needleRotation += shortestAngle(normaliseDegrees(needleRotation), targetRotation);
  needle.style.setProperty('--needle-angle', `${needleRotation}deg`);
}

function handleOrientation(event) {
  let rawHeading = null;

  if (typeof event.webkitCompassHeading === 'number') {
    rawHeading = event.webkitCompassHeading;
  } else if (event.absolute && typeof event.alpha === 'number') {
    rawHeading = normaliseDegrees(360 - event.alpha);
  }

  if (rawHeading === null) return;

  if (smoothedHeading === null) {
    smoothedHeading = rawHeading;
  } else {
    smoothedHeading = normaliseDegrees(
      smoothedHeading + shortestAngle(smoothedHeading, rawHeading) * ORIENTATION_SMOOTHING
    );
  }

  if (orientationFrame) return;
  orientationFrame = requestAnimationFrame(() => {
    rotateNeedle();
    orientationFrame = undefined;
  });
}

async function enableOrientation() {
  if (!('DeviceOrientationEvent' in window)) return;

  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission(true);
      if (permission !== 'granted') return;
    }

    const eventName = 'ondeviceorientationabsolute' in window
      ? 'deviceorientationabsolute'
      : 'deviceorientation';
    window.addEventListener(eventName, handleOrientation, true);
  } catch {
    // Sin sensor, la aguja continúa funcionando respecto al norte geográfico.
  }
}

function showArrival(name, isFinal) {
  stopLocationUpdates();
  routePhase = 'arrival';

  const overlay = document.getElementById('arrival-overlay');
  const message = document.getElementById('arrival-message');
  const continueButton = document.getElementById('arrival-continue');
  const hintModal = document.getElementById('hint-modal');
  if (!overlay || !message || !continueButton) return;

  if (hintModal) hintModal.hidden = true;
  message.textContent = isFinal
    ? `¡Enhorabuena! Has llegado a ${name} y has completado todo el recorrido.`
    : `¡Enhorabuena! Has llegado a ${name}.`;
  continueButton.textContent = isFinal ? 'Finalizar' : 'Siguiente punto';
  overlay.hidden = false;

  setTimeout(() => continueButton.focus(), 2350);
}

function showSavedCompletedRoute() {
  stopLocationUpdates();
  routePhase = 'complete';
  document.getElementById('location-status').textContent = 'Ruta completada';
  document.getElementById('location-distance').textContent = '¡Ya completaste todos los destinos!';
  document.getElementById('location-bearing').textContent = 'Tu progreso está guardado en este dispositivo.';
  document.getElementById('test-arrival-button').textContent = 'Reiniciar recorrido';
}

function reachCurrentDestination() {
  if (routePhase !== 'tracking') return;
  const destination = locations[currentDestinationIndex];
  if (!destination) return;

  const isFinal = currentDestinationIndex === locations.length - 1;
  saveCompletedLocation(destination, isFinal);
  const nextPendingIndex = locations.findIndex(
    (location) => !completedLocationIds.has(getLocationId(location))
  );
  currentDestinationIndex = nextPendingIndex === -1 ? locations.length : nextPendingIndex;
  showArrival(destination.name, isFinal);
}

function continueAfterArrival() {
  if (routePhase !== 'arrival' || !pendingArrival) return;

  const isFinal = pendingArrival.isFinal;
  pendingArrival = null;
  persistProgress();
  document.getElementById('arrival-overlay').hidden = true;

  if (isFinal) {
    routePhase = 'complete';
    window.location.assign('final.html');
    return;
  }

  routePhase = 'idle';
  document.getElementById('location-status').textContent = 'Preparando el siguiente punto…';
  document.getElementById('location-distance').textContent = '—';
  document.getElementById('location-bearing').textContent = '';
  startLocationUpdates();
}

function processPosition(coords) {
  lastKnownPosition = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    recordedAt: Date.now(),
  };

  const destination = locations[currentDestinationIndex];
  if (!destination) return;

  const distanceMetres = calculateDistanceMetres(coords.latitude, coords.longitude, destination);

  if (distanceMetres <= ARRIVAL_DISTANCE_METRES) {
    reachCurrentDestination();
    return;
  }

  destinationBearing = calculateBearing(coords.latitude, coords.longitude, destination);
  document.getElementById('location-distance').textContent = formatDistance(distanceMetres);
  document.getElementById('location-bearing').textContent = '';
  document.getElementById('location-status').textContent = smoothedHeading === null
    ? 'Ubicación actualizada · orienta el norte hacia arriba'
    : 'Ubicación y orientación actualizadas';
  rotateNeedle();
}

function updateLocation(requireFreshPosition = false) {
  const status = document.getElementById('location-status');
  const distance = document.getElementById('location-distance');
  const bearing = document.getElementById('location-bearing');

  if (!navigator.geolocation) {
    status.textContent = 'Este navegador no permite obtener tu ubicación.';
    distance.textContent = 'Brújula orientada al norte';
    return;
  }

  if (!isTracking || routePhase !== 'tracking' || locationRequestInProgress) return;

  status.textContent = 'Buscando tu ubicación…';
  locationRequestInProgress = true;
  const requestGeneration = trackingGeneration;
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      if (requestGeneration !== trackingGeneration || routePhase !== 'tracking') return;
      locationRequestInProgress = false;
      if (isTracking) processPosition(coords);
    },
    (error) => {
      if (requestGeneration !== trackingGeneration || routePhase !== 'tracking') return;
      locationRequestInProgress = false;
      if (!isTracking) return;
      const messages = {
        1: 'Activa el permiso de ubicación para comenzar la ruta.',
        2: 'No se ha podido determinar tu ubicación.',
        3: 'La ubicación está tardando demasiado. Volveremos a intentarlo.',
      };
      status.textContent = messages[error.code] || 'No se ha podido activar la brújula.';
      distance.textContent = '—';
      bearing.textContent = '';
    },
    {
      enableHighAccuracy: true,
      maximumAge: requireFreshPosition ? 0 : 2000,
      timeout: requireFreshPosition ? 10000 : 8000,
    }
  );
}

async function startLocationUpdates() {
  const status = document.getElementById('location-status');
  clearInterval(locationTimer);
  trackingGeneration += 1;
  const startGeneration = trackingGeneration;
  locationRequestInProgress = false;
  isTracking = true;
  routePhase = 'tracking';

  try {
    locationsPromise ||= loadLocations();
    await locationsPromise;
    if (!isTracking || startGeneration !== trackingGeneration) return;
    if (pendingArrival) {
      showArrival(pendingArrival.name, pendingArrival.isFinal);
      return;
    }
    if (currentDestinationIndex >= locations.length) {
      showSavedCompletedRoute();
      return;
    }
    updateLocation(true);
    locationTimer = setInterval(updateLocation, UPDATE_INTERVAL);
  } catch (error) {
    console.error(error);
    status.textContent = 'No se ha podido cargar la ruta de localizaciones.';
    document.getElementById('location-distance').textContent = 'Revisa localizaciones.txt';
  }
}

function stopLocationUpdates() {
  trackingGeneration += 1;
  clearInterval(locationTimer);
  locationTimer = undefined;
  isTracking = false;
  locationRequestInProgress = false;
}

function requestCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este navegador no permite obtener tu ubicación.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        lastKnownPosition = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          recordedAt: Date.now(),
        };
        resolve(lastKnownPosition);
      },
      (error) => {
        const messages = {
          1: 'Activa el permiso de ubicación y comprueba que la web usa HTTPS.',
          2: 'No se ha podido encontrar tu ubicación actual.',
          3: 'La ubicación está tardando demasiado. Inténtalo de nuevo.',
        };
        reject(new Error(messages[error.code] || 'No se ha podido obtener tu ubicación.'));
      },
      // Pista must always begin from a fresh reading, never from a cached fix.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  });
}

function initialiseHintMap(latitude, longitude) {
  if (!window.L) throw new Error('No se ha podido cargar el mapa. Comprueba tu conexión.');

  if (!hintMap) {
    hintMap = window.L.map('hint-map', { zoomControl: true }).setView([latitude, longitude], 16);
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(hintMap);
    hintMapLayers = window.L.layerGroup().addTo(hintMap);

    if ('ResizeObserver' in window) {
      hintMapResizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => hintMap?.invalidateSize({ animate: false }));
      });
      hintMapResizeObserver.observe(document.getElementById('hint-map'));
    }
  }

  hintMapLayers.clearLayers();
  hintMap.setView([latitude, longitude], 16);
  [0, 150, 400].forEach((delay) => {
    setTimeout(() => hintMap.invalidateSize({ animate: false }), delay);
  });
}

function findNextStreet(steps) {
  const currentStreet = (steps[0]?.name || '').trim();
  const nextStepIndex = steps.findIndex((step, index) => {
    if (index === 0) return false;
    const street = (step.name || '').trim();
    return street && street !== currentStreet;
  });

  if (nextStepIndex !== -1) {
    return { name: steps[nextStepIndex].name.trim(), stepIndex: nextStepIndex };
  }

  const firstNamedIndex = steps.findIndex((step) => (step.name || '').trim());
  return firstNamedIndex === -1
    ? { name: '', stepIndex: steps.length - 1 }
    : { name: steps[firstNamedIndex].name.trim(), stepIndex: firstNamedIndex };
}

function getStreetHintCoordinates(route, nextStreet) {
  const steps = route.legs?.[0]?.steps || [];
  const coordinates = steps
    .slice(0, Math.max(1, nextStreet.stepIndex))
    .flatMap((step) => step.geometry?.coordinates || []);
  const streetEntry = steps[nextStreet.stepIndex]?.geometry?.coordinates?.[0];
  if (streetEntry) coordinates.push(streetEntry);

  if (coordinates.length >= 2) {
    return coordinates.map(([longitude, latitude]) => [latitude, longitude]);
  }

  return route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]);
}

async function loadWalkingRoute(origin, destination) {
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const endpoint = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coordinates}`
    + '?overview=full&geometries=geojson&steps=true';
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });

  if (!response.ok) throw new Error('El servicio de rutas no está disponible ahora mismo.');
  const data = await response.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('No se ha encontrado un camino a pie hasta la siguiente pista.');
  }

  return data.routes[0];
}

async function openHintMap() {
  const modal = document.getElementById('hint-modal');
  const instruction = document.getElementById('hint-map-instruction');
  const hintButton = document.getElementById('hint-button');
  modal.hidden = false;
  hintButton.disabled = true;
  instruction.textContent = 'Localizando tu posición…';

  try {
    if (routePhase !== 'tracking') throw new Error('Continúa al siguiente punto antes de pedir una pista.');
    // Render the map immediately; GPS and routing can finish afterwards.
    initialiseHintMap(GRANADA_CENTRE.latitude, GRANADA_CENTRE.longitude);
    locationsPromise ||= loadLocations();
    await locationsPromise;
    const destination = locations[currentDestinationIndex];
    if (!destination) throw new Error('Ya has completado todos los destinos de la ruta.');
    const destinationId = getLocationId(destination);
    const hintGeneration = trackingGeneration;

    // Always request a new fix when Pista is pressed. This makes the next
    // street advance together with the person instead of reusing an old route.
    const origin = await requestCurrentPosition();
    if (routePhase !== 'tracking' || hintGeneration !== trackingGeneration
        || getLocationId(locations[currentDestinationIndex]) !== destinationId) return;
    initialiseHintMap(origin.latitude, origin.longitude);
    instruction.textContent = 'Buscando el mejor camino a pie…';

    const route = await loadWalkingRoute(origin, destination);
    if (routePhase !== 'tracking' || hintGeneration !== trackingGeneration
        || getLocationId(locations[currentDestinationIndex]) !== destinationId) return;
    const steps = route.legs?.[0]?.steps || [];
    const nextStreet = findNextStreet(steps);
    const routeCoordinates = getStreetHintCoordinates(route, nextStreet);

    window.L.polyline(routeCoordinates, {
      color: '#fff8df',
      weight: 11,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(hintMapLayers);

    const routeLine = window.L.polyline(routeCoordinates, {
      color: '#9d3b2d',
      weight: 6,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(hintMapLayers);

    const userIcon = window.L.divIcon({
      className: '',
      html: '<div class="hint-map__user-marker"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    window.L.marker([origin.latitude, origin.longitude], { icon: userIcon, zIndexOffset: 1000 })
      .bindTooltip('Estás aquí', { permanent: true, direction: 'top', offset: [0, -14] })
      .addTo(hintMapLayers);

    const streetEntry = routeCoordinates[routeCoordinates.length - 1];
    const nextIcon = window.L.divIcon({
      className: '',
      html: '<div class="hint-map__next-marker"><span>➜</span></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });
    window.L.marker(streetEntry, { icon: nextIcon, zIndexOffset: 900 })
      .bindTooltip('Siguiente calle', { direction: 'top', offset: [0, -25] })
      .addTo(hintMapLayers);

    hintMap.fitBounds(routeLine.getBounds(), { padding: [45, 45], maxZoom: 18 });
    setTimeout(() => hintMap.invalidateSize({ animate: false }), 100);
    instruction.textContent = nextStreet.name
      ? `Siguiente calle: ${nextStreet.name}`
      : 'Sigue el trazado dorado hasta el siguiente giro.';
  } catch (error) {
    instruction.textContent = error.message || 'No se ha podido preparar la pista.';
  } finally {
    hintButton.disabled = false;
  }
}

function closeHintMap() {
  document.getElementById('hint-modal').hidden = true;
  document.getElementById('hint-button').focus();
}

export function initExperience() {
  const startButton = document.getElementById('btn-empezar');
  const backButton = document.getElementById('btn-volver');
  const landing = document.getElementById('landing');
  const experience = document.getElementById('experience');
  const testArrivalButton = document.getElementById('test-arrival-button');
  const hintButton = document.getElementById('hint-button');
  const hintModal = document.getElementById('hint-modal');
  const hintModalClose = document.getElementById('hint-modal-close');
  const arrivalOverlay = document.getElementById('arrival-overlay');
  const arrivalContinue = document.getElementById('arrival-continue');

  if (!startButton || !backButton || !landing || !experience || !testArrivalButton
      || !hintButton || !hintModal || !hintModalClose || !arrivalOverlay || !arrivalContinue) return;

  hintButton.addEventListener('click', openHintMap);
  hintModalClose.addEventListener('click', closeHintMap);
  hintModal.addEventListener('click', (event) => {
    if (event.target === hintModal) closeHintMap();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !hintModal.hidden) closeHintMap();
  });
  arrivalContinue.addEventListener('click', continueAfterArrival);

  testArrivalButton.addEventListener('click', async () => {
    testArrivalButton.disabled = true;

    try {
      locationsPromise ||= loadLocations();
      await locationsPromise;

      if (currentDestinationIndex >= locations.length) {
        clearSavedProgress();
        arrivalOverlay.hidden = true;
        document.getElementById('location-status').textContent = 'Recorrido reiniciado';
        document.getElementById('location-distance').textContent = 'Primer destino preparado';
        document.getElementById('location-bearing').textContent = 'Calculando el rumbo…';
        testArrivalButton.textContent = 'Simular llegada';
        isTracking = true;
        startLocationUpdates();
      } else {
        reachCurrentDestination();
      }
    } catch (error) {
      console.error(error);
      document.getElementById('location-status').textContent = 'No se ha podido cargar la ruta de prueba.';
    } finally {
      testArrivalButton.disabled = false;
    }
  });

  startButton.addEventListener('click', (event) => {
    event.preventDefault();
    enableOrientation();
    document.body.classList.add('is-transitioning');

    setTimeout(() => {
      landing.hidden = true;
      experience.hidden = false;
      document.body.classList.remove('is-transitioning');
      document.body.classList.add('has-experience');
      requestAnimationFrame(() => experience.classList.add('is-active'));
      startLocationUpdates();
    }, 900);
  });

  backButton.addEventListener('click', () => {
    stopLocationUpdates();
    experience.classList.remove('is-active');

    setTimeout(() => {
      experience.hidden = true;
      landing.hidden = false;
      document.body.classList.remove('has-experience');
      document.body.classList.add('is-returning');
      requestAnimationFrame(() => document.body.classList.remove('is-returning'));
    }, 450);
  });
}
