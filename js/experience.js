/**
 * Transición desde la portada y brújula orientada hacia la Alhambra.
 * La ubicación se vuelve a solicitar cada tres segundos mientras esta vista
 * permanece abierta. Ningún dato sale del navegador.
 */

const ALHAMBRA = {
  latitude: 37.17687,
  longitude: -3.58988,
};

const UPDATE_INTERVAL = 3000;
const TO_RADIANS = Math.PI / 180;
const TO_DEGREES = 180 / Math.PI;

let locationTimer;
let destinationBearing = 0;
let deviceHeading = null;

function normaliseDegrees(value) {
  return (value + 360) % 360;
}

function calculateBearing(latitude, longitude) {
  const latitudeFrom = latitude * TO_RADIANS;
  const latitudeTo = ALHAMBRA.latitude * TO_RADIANS;
  const longitudeDelta = (ALHAMBRA.longitude - longitude) * TO_RADIANS;

  const y = Math.sin(longitudeDelta) * Math.cos(latitudeTo);
  const x = Math.cos(latitudeFrom) * Math.sin(latitudeTo)
    - Math.sin(latitudeFrom) * Math.cos(latitudeTo) * Math.cos(longitudeDelta);

  return normaliseDegrees(Math.atan2(y, x) * TO_DEGREES);
}

function calculateDistance(latitude, longitude) {
  const earthRadiusKm = 6371;
  const latitudeDelta = (ALHAMBRA.latitude - latitude) * TO_RADIANS;
  const longitudeDelta = (ALHAMBRA.longitude - longitude) * TO_RADIANS;
  const latitudeFrom = latitude * TO_RADIANS;
  const latitudeTo = ALHAMBRA.latitude * TO_RADIANS;

  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeFrom) * Math.cos(latitudeTo)
    * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(distanceKm) {
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m de la Alhambra`;
  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km de la Alhambra`;
}

function rotateNeedle() {
  const needle = document.getElementById('compass-needle');
  if (!needle) return;

  const relativeBearing = normaliseDegrees(destinationBearing - (deviceHeading || 0));
  needle.style.setProperty('--needle-angle', `${relativeBearing}deg`);
}

function handleOrientation(event) {
  if (typeof event.webkitCompassHeading === 'number') {
    deviceHeading = event.webkitCompassHeading;
  } else if (event.absolute && typeof event.alpha === 'number') {
    deviceHeading = normaliseDegrees(360 - event.alpha);
  }

  rotateNeedle();
}

async function enableOrientation() {
  if (!('DeviceOrientationEvent' in window)) return;

  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission(true);
      if (permission !== 'granted') return;
    }

    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
  } catch {
    // The compass still works as a north-oriented dial without sensor access.
  }
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

  status.textContent = 'Buscando tu ubicación…';

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      destinationBearing = calculateBearing(coords.latitude, coords.longitude);
      distance.textContent = formatDistance(calculateDistance(coords.latitude, coords.longitude));
      bearing.textContent = `Rumbo ${Math.round(destinationBearing)}°`;
      status.textContent = deviceHeading === null
        ? 'Ubicación actualizada · orienta el norte hacia arriba'
        : 'Ubicación y orientación actualizadas';
      rotateNeedle();
    },
    (error) => {
      const messages = {
        1: 'Activa el permiso de ubicación para encontrar la Alhambra.',
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

function startLocationUpdates() {
  clearInterval(locationTimer);
  updateLocation();
  locationTimer = setInterval(updateLocation, UPDATE_INTERVAL);
}

function stopLocationUpdates() {
  clearInterval(locationTimer);
  locationTimer = undefined;
}

export function initExperience() {
  const startButton = document.getElementById('btn-empezar');
  const backButton = document.getElementById('btn-volver');
  const landing = document.getElementById('landing');
  const experience = document.getElementById('experience');

  if (!startButton || !backButton || !landing || !experience) return;

  startButton.addEventListener('click', (event) => {
    event.preventDefault();

    // iOS only accepts the sensor request during the original click.
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
      requestAnimationFrame(() => {
        document.body.classList.remove('is-returning');
      });
    }, 450);
  });
}
