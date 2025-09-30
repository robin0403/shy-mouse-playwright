class ShyMouse {

  constructor(page) {
    this.page = page;
    this.lastPos = { x: 0, y: 0 }; // Initial position; can be set manually if needed
  }

  async isElementInViewport(element, viewport, buffer = 10) {

    const box = await element.boundingBox();

    if (!box) return false;

    const scrollY = await this.page.evaluate(() => window.scrollY);
    const viewTop = scrollY - buffer;
    const viewBottom = scrollY + viewport.height + buffer;

    // Check if at least part of the element is visible
    return (box.y < viewBottom && box.y + box.height > viewTop);

  }

  async getCurrentScrollY() {
    return await this.page.evaluate(() => window.scrollY);
  }

  async scrollToElement(element, options = {}) {

    const viewport = this.page.viewportSize();

    if (await this.isElementInViewport(element, viewport, options.visibilityBuffer ?? 50)) {
      return; // Already visible
    }

    const box = await element.boundingBox();

    if (!box) throw new Error('Element has no bounding box');

    // Target scroll to bring element to center or near top (configurable)
    const targetPosition = options.targetPosition ?? 'center'; // 'top', 'center', 'bottom'
    let targetScrollY;

    const scrollY = await this.getCurrentScrollY();

    if (targetPosition === 'top') {
      targetScrollY = box.y - (options.offset ?? 100);
    } else if (targetPosition === 'bottom') {
      targetScrollY = box.y + box.height - viewport.height + (options.offset ?? 100);
    } else { // center
      targetScrollY = box.y + box.height / 2 - viewport.height / 2;
    }

    targetScrollY = Math.max(0, targetScrollY); // Don't scroll negative

    // Move mouse to a random position in viewport for realistic scrolling (humans hover while scrolling)
    const hoverOptions = {
      ...options,
      defaultTargetWidth: viewport.width / 2 // Larger "target" for random move
    };

    await this.move(hoverOptions);

    // Calculate total delta
    let remainingDelta = targetScrollY - scrollY;
    const direction = remainingDelta > 0 ? 1 : -1;
    remainingDelta = Math.abs(remainingDelta);

    // Number of scroll steps based on distance (similar to Fitts, but for scroll)
    const scrollID = Math.log2(remainingDelta / 100 + 1); // Assume 100px as "width"
    const numSteps = Math.max(5, Math.round(8 * scrollID)); // Min 5, scale up

    // Optional overshoot (20% chance if delta > 200px)
    const overshootProb = options.overshootProb ?? 0.2;

    let overshootAmount = 0;

    if (remainingDelta > 200 && Math.random() < overshootProb) {

      overshootAmount = Math.random() * 0.3 * viewport.height + 0.1 * viewport.height; // 10-40% of viewport
      targetScrollY += direction * overshootAmount;
      remainingDelta += overshootAmount;

    }

    let cumulativeT = 0;

    for (let i = 1; i <= numSteps; i++) {

      let currentScrollY = await this.getCurrentScrollY();
      remainingDelta = Math.abs(targetScrollY - currentScrollY);

      if (remainingDelta < 10) break; // Close enough

      const linearT = i / numSteps;
      const easedT = this.easeInOutCubic(linearT);
      const stepFraction = easedT - cumulativeT;
      cumulativeT = easedT;

      let stepDelta = stepFraction * remainingDelta;

      // Add Gaussian jitter to step delta
      const jitterStdDev = options.scrollJitterStdDev ?? 20; // Pixels
      stepDelta += this.randomGaussian(0, jitterStdDev);
      stepDelta = Math.max(10, Math.min(stepDelta, 200)); // Clamp to realistic wheel deltas

      await this.page.mouse.wheel(0, direction * stepDelta);

      // Random delay between scrolls (20-100ms for human feel)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 80 + 20));

    }

    // If overshot, correct back
    if (overshootAmount > 0) {

      // Short correction scroll in opposite direction
      const correctionSteps = Math.round(numSteps / 3);
      let correctionCumulativeT = 0;

      for (let i = 1; i <= correctionSteps; i++) {

        let currentScrollY = await this.getCurrentScrollY();
        let correctionDelta = Math.abs((targetScrollY - direction * overshootAmount) - currentScrollY);

        if (correctionDelta < 10) break;

        const linearT = i / correctionSteps;
        const easedT = this.easeInOutCubic(linearT);
        const stepFraction = easedT - correctionCumulativeT;
        correctionCumulativeT = easedT;

        let stepDelta = stepFraction * correctionDelta;
        stepDelta += this.randomGaussian(0, jitterStdDev / 2); // Less jitter
        stepDelta = Math.max(10, Math.min(stepDelta, 150));

        await this.page.mouse.wheel(0, -direction * stepDelta);

        await new Promise(resolve => setTimeout(resolve, Math.random() * 60 + 10)); // Faster correction

      }

    }

    // Final check and small adjustment if needed
    if (!await this.isElementInViewport(element, viewport, 0)) {

      const finalScrollY = await this.getCurrentScrollY();
      const finalDelta = (box.y + box.height / 2 - viewport.height / 2) - finalScrollY;

      if (Math.abs(finalDelta) > 10) {
        await this.page.mouse.wheel(0, finalDelta);
      }

    }

  }

  // Helper function to calculate point on cubic Bezier curve
  getBezierPoint(t, p0, p1, p2, p3) {
    const omt = 1 - t;
    const x = p0.x * omt ** 3 + 3 * p1.x * omt ** 2 * t + 3 * p2.x * omt * t ** 2 + p3.x * t ** 3;
    const y = p0.y * omt ** 3 + 3 * p1.y * omt ** 2 * t + 3 * p2.y * omt * t ** 2 + p3.y * t ** 3;
    return { x, y };
  }

  // Clamp value between min and max
  clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  // Ease-in-out cubic function for non-linear parameterization
  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Gaussian random (Box-Muller transform)
  randomGaussian(mean = 0, stdDev = 1) {
    let u = 1 - Math.random();
    let v = Math.random();
    let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdDev + mean;
  }

  async click(element, options = {}) {

    // Get element bounding box
    const box = await element.boundingBox();
    const viewport = this.page.viewportSize();

    try {
      await this.scrollToElement(element, options);
    } catch (error) {
    }

    // Configurable padding for click (fraction of element size, e.g., 0.8 means up to 80% from center)
    const clickPaddingFactor = options.clickPadding ?? 0.8;
    const clickOffsetX = (Math.random() * 2 - 1) * (box.width / 2) * clickPaddingFactor;
    const clickOffsetY = (Math.random() * 2 - 1) * (box.height / 2) * clickPaddingFactor;
    let targetX = box.x + box.width / 2 + clickOffsetX;
    let targetY = box.y + box.height / 2 + clickOffsetY;

    // Ensure target is within element bounds
    targetX = this.clamp(targetX, box.x, box.x + box.width);
    targetY = this.clamp(targetY, box.y, box.y + box.height);

    // Start from last known position
    let startX = this.lastPos.x;
    let startY = this.lastPos.y;

    // If initial position is (0,0), initialize to viewport center for natural start
    if (startX === 0 && startY === 0) {

      startX = viewport.width / 2;
      startY = viewport.height / 2;

      startX += (Math.random() * 2 - 1) * (viewport.width / 4);
      startY += (Math.random() * 2 - 1) * (viewport.height / 4);

      this.lastPos.x = startX;
      this.lastPos.y = startY;

    }

    const { points, finalPos } = this.calculateBezierPoints(startX, startY, targetX, targetY, box, viewport, options);

    // Move mouse to each pre-calculated point with random delays for human-like movement
    for (const point of points) {

      await this.page.mouse.move(point.x, point.y);

      // Add a small random delay after each move (5-20ms, varied for more natural feel)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 15 + 5));

    }

    // Perform the click at the final position
    await this.page.mouse.click(finalPos.x, finalPos.y);

    // Optional post-click micro-movement for added realism (small jitter)
    if (Math.random() < 0.5) {

      const jitterX = finalPos.x + this.randomGaussian(0, 5);
      const jitterY = finalPos.y + this.randomGaussian(0, 5);
      await this.page.mouse.move(this.clamp(jitterX, 0, viewport.width), this.clamp(jitterY, 0, viewport.height));
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 20));
      await this.page.mouse.move(finalPos.x, finalPos.y);

    }

    // Update last position
    this.lastPos = finalPos;

  }

  async move(options = {}) {

    const viewport = this.page.viewportSize();

    // Start from last known position
    let startX = this.lastPos.x;
    let startY = this.lastPos.y;

    // If initial position is (0,0), initialize to viewport center for natural start
    if (startX === 0 && startY === 0) {

      startX = viewport.width / 2;
      startY = viewport.height / 2;

      startX += (Math.random() * 2 - 1) * (viewport.width / 4);
      startY += (Math.random() * 2 - 1) * (viewport.height / 4);

      this.lastPos.x = startX;
      this.lastPos.y = startY;

    }

    const { points, finalPos } = this.calculateBezierPoints(startX, startY, null, null, null, viewport, options);

    // Move mouse to each pre-calculated point with random delays for human-like movement
    for (const point of points) {

      await this.page.mouse.move(point.x, point.y);

      // Add a small random delay after each move (5-20ms, varied for more natural feel)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 15 + 5));

    }

    // Update last position (no click)
    this.lastPos = finalPos;

  }

  calculateBezierPoints(startX, startY, targetX = null, targetY = null, box = null, viewport, options) {

    // Viewport padding for randomness and to avoid edges (configurable min/max for randomness)
    const viewPadMin = options.viewPadMin ?? 20;
    const viewPadMax = options.viewPadMax ?? 100;
    const randomPadX = Math.random() * (viewPadMax - viewPadMin) + viewPadMin;
    const randomPadY = Math.random() * (viewPadMax - viewPadMin) + viewPadMin;
    const effectiveMinX = randomPadX;
    const effectiveMaxX = viewport.width - randomPadX;
    const effectiveMinY = randomPadY;
    const effectiveMaxY = viewport.height - randomPadY;

    // If no target provided, generate random target within effective bounds
    let isRandomTarget = false;
    if (targetX === null || targetY === null) {
      targetX = Math.random() * (effectiveMaxX - effectiveMinX) + effectiveMinX;
      targetY = Math.random() * (effectiveMaxY - effectiveMinY) + effectiveMinY;
      isRandomTarget = true;
    }

    // Determine effective width W for Fitts's Law
    let W;

    if (box === null) {
      W = options.defaultTargetWidth ?? 100;
    } else {
      W = Math.min(box.width, box.height);
    }

    // Calculate distance D
    const D = Math.sqrt((targetX - startX) ** 2 + (targetY - startY) ** 2);

    // Fitts's Law: Index of Difficulty (ID) = log2(D / W + 1)
    const ID = Math.log2(D / W + 1);

    // Number of points based on ID (more points for higher difficulty -> slower movement)
    // Tuned: min 15 points (increased for smoother curves), scale with ID
    const numPoints = Math.max(15, Math.round(12 * ID));

    // Generate random control points for cubic Bezier (for natural curve)
    const dx = targetX - startX;
    const dy = targetY - startY;
    const deviation = Math.random() * 0.4 * D + 0.1 * D; // Increased max deviation for more curvature (10-50%)

    // Perpendicular vector for offset (normalized)
    const length = Math.sqrt(dx ** 2 + dy ** 2);
    const perpX = -dy / length;
    const perpY = dx / length;
    const randomSign = Math.random() < 0.5 ? -1 : 1; // Random direction for curve

    // Control points: offset from linear path, with more variability
    const c1x = startX + dx / 3 + randomSign * deviation * perpX * (Math.random() * 0.5 + 0.5);
    const c1y = startY + dy / 3 + randomSign * deviation * perpY * (Math.random() * 0.5 + 0.5);
    const c2x = startX + 2 * dx / 3 + randomSign * deviation * perpX * (Math.random() * 0.5 + 0.5);
    const c2y = startY + 2 * dy / 3 + randomSign * deviation * perpY * (Math.random() * 0.5 + 0.5);

    const p0 = { x: startX, y: startY };
    const p1 = { x: c1x, y: c1y };
    const p2 = { x: c2x, y: c2y };
    const p3 = { x: targetX, y: targetY };

    // Add Gaussian jitter for micro-movements (human hand tremor)
    const jitterStdDev = options.jitterStdDev ?? 1.5; // Configurable, default 1.5 pixels

    // Pre-calculate all points along the Bezier path with easing for acceleration/deceleration
    let points = [];

    for (let i = 1; i <= numPoints; i++) {

      const linearT = i / numPoints;
      const easedT = this.easeInOutCubic(linearT); // Apply easing for human-like velocity profile
      let point = this.getBezierPoint(easedT, p0, p1, p2, p3);

      point.x += this.randomGaussian(0, jitterStdDev);
      point.y += this.randomGaussian(0, jitterStdDev);

      // Clamp point to effective viewport bounds (with random padding) to stay inside window
      point.x = this.clamp(point.x, effectiveMinX, effectiveMaxX);
      point.y = this.clamp(point.y, effectiveMinY, effectiveMaxY);

      points.push(point);

    }

    let finalPos = { x: targetX, y: targetY };

    // Optional overshoot and correction for added realism (20% chance if distance > 100px)
    const overshootProb = options.overshootProb ?? 0.2;

    if (!isRandomTarget && D > 100 && Math.random() < overshootProb) {

      // Calculate overshoot point: extend beyond target by 10-30% of W
      const overshootFactor = Math.random() * 0.2 + 0.1;
      const overshootDist = overshootFactor * W;
      const dirX = dx / length;
      const dirY = dy / length;
      const overshootX = targetX + dirX * overshootDist;
      const overshootY = targetY + dirY * overshootDist;

      // Regenerate main path to overshoot
      const overshootResult = this.calculateBezierPoints(startX, startY, overshootX, overshootY, box, viewport, {
        ...options,
        overshootProb: 0 // Prevent recursive overshoot
      });

      points = overshootResult.points;

      // Short correction path back to target (fewer points, quicker)
      const correctionNumPoints = Math.round(numPoints / 4); // Shorter
      const correctionP0 = { x: overshootX, y: overshootY };
      const correctionDx = targetX - overshootX;
      const correctionDy = targetY - overshootY;
      const correctionDeviation = Math.random() * 0.2 * overshootDist + 0.1 * overshootDist;
      const lengthCorrection = Math.sqrt(correctionDx ** 2 + correctionDy ** 2);
      const correctionPerpX = -correctionDy / lengthCorrection;
      const correctionPerpY = correctionDx / lengthCorrection;
      const correctionSign = Math.random() < 0.5 ? -1 : 1;
      const correctionC1x = overshootX + correctionDx / 3 + correctionSign * correctionDeviation * correctionPerpX * Math.random();
      const correctionC1y = overshootY + correctionDy / 3 + correctionSign * correctionDeviation * correctionPerpY * Math.random();
      const correctionC2x = overshootX + 2 * correctionDx / 3 + correctionSign * correctionDeviation * correctionPerpX * Math.random();
      const correctionC2y = overshootY + 2 * correctionDy / 3 + correctionSign * correctionDeviation * correctionPerpY * Math.random();
      const correctionP1 = { x: correctionC1x, y: correctionC1y };
      const correctionP2 = { x: correctionC2x, y: correctionC2y };
      const correctionP3 = { x: targetX, y: targetY };

      const correctionPoints = [];

      for (let i = 1; i <= correctionNumPoints; i++) {

        const linearT = i / correctionNumPoints;
        const easedT = this.easeInOutCubic(linearT);
        let point = this.getBezierPoint(easedT, correctionP0, correctionP1, correctionP2, correctionP3);
        point.x += this.randomGaussian(0, jitterStdDev / 2); // Less jitter for correction
        point.y += this.randomGaussian(0, jitterStdDev / 2);
        point.x = this.clamp(point.x, effectiveMinX, effectiveMaxX);
        point.y = this.clamp(point.y, effectiveMinY, effectiveMaxY);
        correctionPoints.push(point);

      }

      points = points.concat(correctionPoints);
      finalPos = { x: targetX, y: targetY };

    }

    return { points, finalPos };

  }

}

module.exports = ShyMouse;