/**
 * Transición desde la portada y brújula para una ruta secreta por Granada.
 * Los destinos se cargan desde localizaciones.txt y sólo se revela su nombre
 * cuando el visitante se encuentra a diez metros o menos.
 */

const UPDATE_INTERVAL = 3000;
const ARRIVAL_DISTANCE_METRES = 10;
const ORIENTATION_SMOOTHING = 0.22;
const TO_RADIANS = Math.PI / 180;
const TO_DEGREES = 180 / Math.PI;

let locations = [];
let locationsPromise;
let currentDestinationIndex = 0;
let locationTimer;
let arrivalTimer;
let locationRequestInProgress = false;
let isTracking = false;
let destinationBearing = 0;
let smoothedHeading = null;
let needleRotation = 0;
let orientationFrame;

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

async function loadLocations() {
  const response = await fetch(new URL('../localizaciones.txt', import.meta.url));
  if (!response.ok) throw new Error(`No se pudo cargar localizaciones.txt (${response.status})`);

  const parsedLocations = parseLocations(await response.text());
  if (!parsedLocations.length) throw new Error('localizaciones.txt no contiene destinos válidos');
  locations = parsedLocations;
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

function showArrival(name, routeComplete) {
  const message = document.getElementById('arrival-message');
  if (!message) return;

  clearTimeout(arrivalTimer);
  message.textContent = routeComplete
    ? `¡Enhorabuena, has llegado a ${name}! Has completado la ruta.`
    : `¡Enhorabuena, has llegado a ${name}! Buscando el siguiente destino…`;
  message.hidden = false;

  if (!routeComplete) {
    arrivalTimer = setTimeout(() => {
      message.hidden = true;
    }, 4000);
  }
}

function completeRoute(lastDestination) {
  clearInterval(locationTimer);
  locationTimer = undefined;
  document.getElementById('location-status').textContent = 'Ruta completada';
  document.getElementById('location-distance').textContent = '¡Lo conseguiste!';
  document.getElementById('location-bearing').textContent = '';
  showArrival(lastDestination.name, true);
}

function processPosition(coords) {
  const destination = locations[currentDestinationIndex];
  if (!destination) return;

  const distanceMetres = calculateDistanceMetres(coords.latitude, coords.longitude, destination);

  if (distanceMetres <= ARRIVAL_DISTANCE_METRES) {
    currentDestinationIndex += 1;
    const routeComplete = currentDestinationIndex >= locations.length;
    showArrival(destination.name, routeComplete);

    if (routeComplete) {
      completeRoute(destination);
      return;
    }

    const nextDestination = locations[currentDestinationIndex];
    destinationBearing = calculateBearing(coords.latitude, coords.longitude, nextDestination);
    document.getElementById('location-status').textContent = 'Destino alcanzado · sigue la aguja';
    document.getElementById('location-distance').textContent = 'Nuevo destino preparado';
    document.getElementById('location-bearing').textContent = `Rumbo ${Math.round(destinationBearing)}°`;
    rotateNeedle();
    return;
  }

  destinationBearing = calculateBearing(coords.latitude, coords.longitude, destination);
  document.getElementById('location-distance').textContent = formatDistance(distanceMetres);
  document.getElementById('location-bearing').textContent = `Rumbo ${Math.round(destinationBearing)}°`;
  document.getElementById('location-status').textContent = smoothedHeading === null
    ? 'Ubicación actualizada · orienta el norte hacia arriba'
    : 'Ubicación y orientación actualizadas';
  rotateNeedle();
}

function updateLocation() {
  const status = document.getElementById('location-status');
  const distance = document.getElementById('location-distance');
  const bearing = document.getElementById('location-bearing');

  if (!navigator.geolocation) {
    status.textContent = 'Este navegador no permite obtener tu ubicación.';
    distance.textContent = 'Brújula orientada al norte';
    return;
  }

  if (!isTracking || locationRequestInProgress) return;

  status.textContent = 'Buscando tu ubicación…';
  locationRequestInProgress = true;
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      locationRequestInProgress = false;
      if (isTracking) processPosition(coords);
    },
    (error) => {
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
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 }
  );
}

async function startLocationUpdates() {
  const status = document.getElementById('location-status');
  clearInterval(locationTimer);
  isTracking = true;

  try {
    locationsPromise ||= loadLocations();
    await locationsPromise;
    if (!isTracking) return;
    updateLocation();
    locationTimer = setInterval(updateLocation, UPDATE_INTERVAL);
  } catch (error) {
    console.error(error);
    status.textContent = 'No se ha podido cargar la ruta de localizaciones.';
    document.getElementById('location-distance').textContent = 'Revisa localizaciones.txt';
  }
}

function stopLocationUpdates() {
  clearInterval(locationTimer);
  clearTimeout(arrivalTimer);
  locationTimer = undefined;
  isTracking = false;
  locationRequestInProgress = false;
}

export function initExperience() {
  const startButton = document.getElementById('btn-empezar');
  const backButton = document.getElementById('btn-volver');
  const landing = document.getElementById('landing');
  const experience = document.getElementById('experience');

  if (!startButton || !backButton || !landing || !experience) return;

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
