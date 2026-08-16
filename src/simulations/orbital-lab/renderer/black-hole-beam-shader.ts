export const BLACK_HOLE_BEAM_VERTEX_SHADER = `
  varying vec2 vPlanePosition;
  varying vec3 vWorldPosition;

  void main() {
    vPlanePosition = position.xy;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

// Schwarzschild beam tracing follows Eric Bruneton's BSD-licensed lookup
// parameterization. See THIRD_PARTY_NOTICES.md and arXiv:2010.08735.
export const BLACK_HOLE_BEAM_FRAGMENT_SHADER = `
  precision highp float;

  uniform sampler2D uRayDeflection;
  uniform sampler2D uRayInverseRadius;
  uniform sampler2D uSkyMap;
  uniform mat3 uWorldToDisk;
  uniform mat3 uDiskToWorld;
  uniform vec3 uCameraLocal;
  uniform float uBeamTracingReady;
  uniform float uVisualTime;
  uniform float uMode;
  uniform float uDetail;

  varying vec2 vPlanePosition;
  varying vec3 vWorldPosition;

  const float PI = 3.141592653589793;
  const float MU = 4.0 / 27.0;
  const float INNER_DISC_RADIUS = 3.0;
  const float OUTER_DISC_RADIUS = 12.0;
  const float CRITICAL_IMPACT = 2.598076211353316;
  const vec2 DEFLECTION_SIZE = vec2(512.0, 512.0);
  const vec2 INVERSE_RADIUS_SIZE = vec2(64.0, 32.0);

  vec2 sampleLookup(sampler2D lookup, vec2 uv, vec2 size) {
    vec2 position = clamp(uv, 0.0, 1.0) * size - 0.5;
    vec2 base = floor(position);
    vec2 fraction = fract(position);
    vec2 maximum = size - 1.0;
    vec2 p00 = (clamp(base, vec2(0.0), maximum) + 0.5) / size;
    vec2 p10 = (clamp(base + vec2(1.0, 0.0), vec2(0.0), maximum) + 0.5) / size;
    vec2 p01 = (clamp(base + vec2(0.0, 1.0), vec2(0.0), maximum) + 0.5) / size;
    vec2 p11 = (clamp(base + vec2(1.0), vec2(0.0), maximum) + 0.5) / size;
    vec2 top = mix(texture2D(lookup, p00).rg, texture2D(lookup, p10).rg, fraction.x);
    vec2 bottom = mix(texture2D(lookup, p01).rg, texture2D(lookup, p11).rg, fraction.x);
    return mix(top, bottom, fraction.y);
  }

  vec2 texelCenterCoordinates(vec2 unitCoordinates, vec2 size) {
    return (vec2(0.5) + clamp(unitCoordinates, 0.0, 1.0) * (size - 1.0)) / size;
  }

  float rayDeflectionTextureU(float energySquared) {
    if (energySquared < MU) {
      return 0.5 - sqrt(max(-log(1.0 - energySquared / MU) / 50.0, 0.0));
    }
    return 0.5 + sqrt(max(-log(1.0 - MU / energySquared) / 50.0, 0.0));
  }

  float apsisInverseRadius(float energySquared) {
    float x = (2.0 / MU) * energySquared - 1.0;
    return 1.0 / 3.0 + (2.0 / 3.0) * sin(asin(clamp(x, -1.0, 1.0)) / 3.0);
  }

  float rayDeflectionTextureV(float energySquared, float inverseRadius) {
    if (energySquared > MU) {
      float x = inverseRadius < 2.0 / 3.0
        ? -sqrt(max(2.0 / 3.0 - inverseRadius, 0.0))
        : sqrt(max(inverseRadius - 2.0 / 3.0, 0.0));
      return (sqrt(2.0 / 3.0) + x) / (sqrt(2.0 / 3.0) + sqrt(1.0 / 3.0));
    }
    return 1.0 - sqrt(max(1.0 - inverseRadius / apsisInverseRadius(energySquared), 0.0));
  }

  vec2 lookupDeflection(float energySquared, float inverseRadius, out vec2 apsis) {
    float textureU = rayDeflectionTextureU(energySquared);
    float textureV = rayDeflectionTextureV(energySquared, inverseRadius);
    apsis = sampleLookup(
      uRayDeflection,
      texelCenterCoordinates(vec2(textureU, 1.0), DEFLECTION_SIZE),
      DEFLECTION_SIZE
    );
    return sampleLookup(
      uRayDeflection,
      texelCenterCoordinates(vec2(textureU, textureV), DEFLECTION_SIZE),
      DEFLECTION_SIZE
    );
  }

  float inverseRadiusTextureU(float energySquared) {
    return 1.0 / (1.0 + 6.0 * energySquared);
  }

  float inverseRadiusPhiBound(float energySquared) {
    return (1.0 + energySquared) /
      (1.0 / 3.0 + 2.0 * energySquared * sqrt(energySquared));
  }

  vec2 lookupInverseRadius(float energySquared, float phi) {
    return sampleLookup(
      uRayInverseRadius,
      texelCenterCoordinates(
        vec2(inverseRadiusTextureU(energySquared), phi / inverseRadiusPhiBound(energySquared)),
        INVERSE_RADIUS_SIZE
      ),
      INVERSE_RADIUS_SIZE
    );
  }

  float filteredPulse(float edge0, float edge1, float value, float width) {
    width = max(width, 1e-6);
    float x0 = value - width * 0.5;
    float x1 = x0 + width;
    return max(0.0, (min(x1, edge1) - max(x0, edge0)) / width);
  }

  float traceRay(
    float inverseRadius,
    float radialDerivative,
    float energySquared,
    float delta,
    float alpha,
    out float u0,
    out float phi0,
    out float t0,
    out float opacity0,
    out float u1,
    out float phi1,
    out float t1,
    out float opacity1
  ) {
    u0 = -1.0;
    u1 = -1.0;
    opacity0 = 0.0;
    opacity1 = 0.0;
    if (energySquared < MU && inverseRadius > 2.0 / 3.0) {
      return -1.0;
    }

    vec2 deflectionApsis;
    vec2 deflection = lookupDeflection(energySquared, inverseRadius, deflectionApsis);
    float rayDeflection = deflection.x;
    if (radialDerivative > 0.0) {
      rayDeflection = energySquared < MU ? 2.0 * deflectionApsis.x - rayDeflection : -1.0;
    }

    float directionSign = sign(radialDerivative);
    if (directionSign == 0.0) {
      directionSign = 1.0;
    }
    float phi = deflection.x +
      (directionSign == 1.0 ? PI - delta : delta) + directionSign * alpha;
    float phiApsis = deflectionApsis.x + PI / 2.0;
    phi0 = mod(phi, PI);
    vec2 inverse0 = lookupInverseRadius(energySquared, phi0);
    if (phi0 < phiApsis) {
      float side = directionSign * (inverse0.x - inverseRadius);
      if (side > 1e-3 || (side > -1e-3 && alpha < delta)) {
        u0 = inverse0.x;
        phi0 = alpha + phi - phi0;
        t0 = directionSign * (inverse0.y - deflection.y);
      }
    }

    phi = 2.0 * phiApsis - phi;
    phi1 = mod(phi, PI);
    vec2 inverse1 = lookupInverseRadius(energySquared, phi1);
    if (energySquared < MU && directionSign == 1.0 && phi1 < phiApsis) {
      u1 = inverse1.x;
      phi1 = alpha + phi - phi1;
      t1 = 2.0 * deflectionApsis.y - inverse1.y - deflection.y;
    }

    float inverseInner = 1.0 / INNER_DISC_RADIUS;
    float inverseOuter = 1.0 / OUTER_DISC_RADIUS;
    float width0 = min(fwidth(inverse0.x), fwidth(u0 == -1.0 ? u1 : u0));
    float width1 = min(fwidth(inverse1.x), fwidth(u1 == -1.0 ? u0 : u1));
    opacity0 = filteredPulse(inverseOuter, inverseInner, u0, width0);
    opacity1 = filteredPulse(inverseOuter, inverseInner, u1, width1);
    if (
      directionSign == 1.0 &&
      abs(energySquared - MU) < min(fwidth(energySquared), MU)
    ) {
      if (opacity0 < 0.99) u0 = 2.0 / (1.0 / inverseInner + 1.0 / inverseOuter);
      if (opacity1 < 0.99) u1 = 2.0 / (1.0 / inverseInner + 1.0 / inverseOuter);
    }
    return rayDeflection;
  }

  float hash(vec2 value) {
    return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 value) {
    vec2 cell = floor(value);
    vec2 local = fract(value);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), local.x),
      local.y
    );
  }

  float discStructure(vec2 polarPosition, float retardedTime) {
    float radius = polarPosition.x;
    float angle = polarPosition.y;
    float angularVelocity = sqrt(0.5 / (radius * radius * radius));
    vec2 flow = vec2(
      angle - angularVelocity * retardedTime + radius * 0.72,
      radius * 1.8
    );
    float structure = noise(flow * vec2(2.7, 1.4));
    if (uDetail > 0.5) {
      structure = structure * 0.68 + noise(flow * vec2(6.4, 3.2) + 7.1) * 0.32;
    }
    if (uDetail > 1.5) {
      structure = structure * 0.78 + noise(flow * vec2(14.0, 7.0) - 3.4) * 0.22;
    }
    float filaments = 0.72 + 0.28 * sin(angle * 7.0 - retardedTime * 0.12 + radius * 5.0);
    return clamp(0.35 + structure * 0.72 + filaments * 0.16, 0.0, 1.0);
  }

  vec3 thermalColor(float temperature, float dopplerFactor) {
    float shifted = clamp(temperature * pow(clamp(dopplerFactor, 0.35, 2.8), 0.72), 0.0, 1.2);
    vec3 amber = vec3(0.93, 0.13, 0.012);
    vec3 gold = vec3(1.0, 0.58, 0.11);
    vec3 white = vec3(1.0, 0.96, 0.82);
    vec3 blueWhite = vec3(0.69, 0.83, 1.0);
    vec3 color = mix(amber, gold, smoothstep(0.08, 0.42, shifted));
    color = mix(color, white, smoothstep(0.34, 0.82, shifted));
    color = mix(color, blueWhite, smoothstep(0.82, 1.18, shifted));
    return color;
  }

  vec4 discColor(vec2 position, float retardedTime, float dopplerFactor) {
    if (uMode < 0.5) {
      return vec4(0.0);
    }
    float radius = length(position);
    if (radius <= INNER_DISC_RADIUS || radius >= OUTER_DISC_RADIUS) {
      return vec4(0.0);
    }

    float profileTerm = max(1.0 - sqrt(INNER_DISC_RADIUS / radius), 0.0) /
      (radius * radius * radius);
    float referenceRadius = 49.0 / 12.0;
    float referenceTerm = (1.0 - sqrt(INNER_DISC_RADIUS / referenceRadius)) /
      (referenceRadius * referenceRadius * referenceRadius);
    float temperature = pow(profileTerm / referenceTerm, 0.25);
    float angle = atan(position.y, position.x);
    float structure = discStructure(vec2(radius, angle), retardedTime);
    float innerFade = smoothstep(INNER_DISC_RADIUS, INNER_DISC_RADIUS * 1.08, radius);
    float outerFade = 1.0 - smoothstep(OUTER_DISC_RADIUS * 0.82, OUTER_DISC_RADIUS, radius);
    float activity = uMode > 1.5 ? 1.0 : 0.72;
    float opacity = innerFade * outerFade * structure * activity;
    float invariantBoost = pow(clamp(dopplerFactor, 0.42, 2.2), 3.0);
    vec3 color = thermalColor(temperature, dopplerFactor) *
      (0.55 + 1.35 * temperature) * invariantBoost * activity;
    return vec4(color, clamp(opacity, 0.0, uMode > 1.5 ? 0.96 : 0.82));
  }

  vec3 sampleSky(vec3 localDirection) {
    vec3 direction = normalize(uDiskToWorld * localDirection);
    vec2 uv = vec2(
      atan(direction.z, direction.x) / (2.0 * PI) + 0.5,
      asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5
    );
    vec3 observed = texture2D(uSkyMap, uv).rgb;
    return observed * 1.26 + pow(observed, vec3(0.72)) * 0.14;
  }

  void compositeDisc(
    vec4 disc,
    float intersectionOpacity,
    inout vec3 premultiplied,
    inout float alpha
  ) {
    float opacity = clamp(disc.a * intersectionOpacity, 0.0, 1.0);
    premultiplied = premultiplied * (1.0 - opacity) + disc.rgb * opacity;
    alpha = alpha * (1.0 - opacity) + opacity;
  }

  void main() {
    float planeRadius = length(vPlanePosition);
    if (planeRadius > 13.8) {
      discard;
    }

    if (uBeamTracingReady < 0.5) {
      float shadow = 1.0 - smoothstep(CRITICAL_IMPACT - 0.08, CRITICAL_IMPACT + 0.08, planeRadius);
      if (shadow <= 0.0) {
        discard;
      }
      gl_FragColor = vec4(vec3(0.0), shadow);
      return;
    }

    vec3 cameraLocal = uCameraLocal;
    float cameraRadius = length(cameraLocal);
    if (cameraRadius <= 1.001) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec3 euclideanRay = normalize(uWorldToDisk * (vWorldPosition - cameraPosition));
    vec3 radial = normalize(cameraLocal);
    float inverseCameraRadius = 1.0 / cameraRadius;
    float radialComponent = dot(euclideanRay, radial);
    vec3 rayDirection = euclideanRay +
      radial * radialComponent * (sqrt(max(1.0 - inverseCameraRadius, 1e-5)) - 1.0);

    vec3 rayPlaneNormal = cross(radial, rayDirection);
    if (dot(rayPlaneNormal, rayPlaneNormal) < 1e-10) {
      rayPlaneNormal = cross(radial, abs(radial.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0));
    }
    rayPlaneNormal = normalize(rayPlaneNormal);
    vec3 rayPlaneTangent = normalize(cross(rayPlaneNormal, radial));
    vec3 lineOfNodes = cross(vec3(0.0, 0.0, 1.0), rayPlaneNormal);
    if (dot(lineOfNodes, lineOfNodes) < 1e-10) {
      lineOfNodes = rayPlaneTangent;
    } else {
      lineOfNodes = normalize(lineOfNodes);
    }
    if (dot(lineOfNodes, rayPlaneTangent) < 0.0) {
      lineOfNodes = -lineOfNodes;
    }

    float alphaAngle = acos(clamp(dot(radial, lineOfNodes), -1.0, 1.0));
    float delta = acos(clamp(dot(radial, normalize(rayDirection)), -1.0, 1.0));
    float radialDerivative = -inverseCameraRadius / tan(delta);
    float energySquared = radialDerivative * radialDerivative +
      inverseCameraRadius * inverseCameraRadius * (1.0 - inverseCameraRadius);

    float u0, phi0, t0, opacity0, u1, phi1, t1, opacity1;
    float deflection = traceRay(
      inverseCameraRadius,
      radialDerivative,
      max(energySquared, 1e-9),
      delta,
      alphaAngle,
      u0,
      phi0,
      t0,
      opacity0,
      u1,
      phi1,
      t1,
      opacity1
    );

    float deltaPrime = delta + max(deflection, 0.0);
    vec3 escapedDirection = cos(deltaPrime) * radial + sin(deltaPrime) * rayPlaneTangent;
    float lensAlpha = 1.0 - smoothstep(3.9, 4.8, planeRadius);
    float edgeFade = 1.0 - smoothstep(12.6, 13.8, planeRadius);
    vec3 premultiplied = vec3(0.0);
    float outputAlpha = 0.0;

    float conservedEnergy = -sqrt(max(energySquared, 1e-9));
    float receiverScalar = conservedEnergy / sqrt(max(1.0 - inverseCameraRadius, 1e-5));
    if (deflection >= 0.0) {
      vec3 sky = sampleSky(escapedDirection);
      vec3 inputDx = dFdx(rayDirection);
      vec3 inputDy = dFdy(rayDirection);
      vec3 outputDx = dFdx(escapedDirection);
      vec3 outputDy = dFdy(escapedDirection);
      float inputSolidAngle = length(cross(inputDx, inputDy));
      float outputSolidAngle = length(cross(outputDx, outputDy));
      float amplification = clamp(inputSolidAngle / max(outputSolidAngle, 1e-8), 0.2, 16.0);
      sky *= clamp(pow(amplification, 0.18), 0.72, 1.65);
      outputAlpha = lensAlpha;
      premultiplied = sky * outputAlpha;
    } else {
      outputAlpha = 1.0;
    }

    if (u1 >= 0.0 && opacity1 > 0.0) {
      float sourceScalar = conservedEnergy * sqrt(2.0 / max(2.0 - 3.0 * u1, 1e-5)) -
        u1 * sqrt(u1 / max(2.0 - 3.0 * u1, 1e-5)) * rayPlaneNormal.z;
      float doppler = receiverScalar / sourceScalar;
      vec3 intersection =
        (radial * cos(phi1) + rayPlaneTangent * sin(phi1)) / u1;
      compositeDisc(
        discColor(intersection.xy, uVisualTime - t1, doppler),
        opacity1,
        premultiplied,
        outputAlpha
      );
    }
    if (u0 >= 0.0 && opacity0 > 0.0) {
      float sourceScalar = conservedEnergy * sqrt(2.0 / max(2.0 - 3.0 * u0, 1e-5)) -
        u0 * sqrt(u0 / max(2.0 - 3.0 * u0, 1e-5)) * rayPlaneNormal.z;
      float doppler = receiverScalar / sourceScalar;
      vec3 intersection =
        (radial * cos(phi0) + rayPlaneTangent * sin(phi0)) / u0;
      compositeDisc(
        discColor(intersection.xy, uVisualTime - t0, doppler),
        opacity0,
        premultiplied,
        outputAlpha
      );
    }

    outputAlpha *= edgeFade;
    if (outputAlpha < 0.004) {
      discard;
    }
    gl_FragColor = vec4(premultiplied / max(outputAlpha, 1e-5), outputAlpha);
  }
`;
