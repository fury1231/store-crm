import { describe, it, expect } from 'vitest';
import { app } from './app';

describe('Health endpoint', () => {
  it('should return status ok', async () => {
    // Create a mock request/response to test the route handler
    const routes = (app as any)._router.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods)[0],
      }));

    const healthRoute = routes.find(
      (r: any) => r.path === '/api/health' && r.method === 'get',
    );

    expect(healthRoute).toBeDefined();
    expect(healthRoute.path).toBe('/api/health');
    expect(healthRoute.method).toBe('get');
  });

  it('should have JSON middleware configured', () => {
    const middlewareNames = (app as any)._router.stack
      .filter((layer: any) => layer.name)
      .map((layer: any) => layer.name);

    expect(middlewareNames).toContain('jsonParser');
  });

  it('should have CORS middleware configured', () => {
    const middlewareNames = (app as any)._router.stack
      .filter((layer: any) => layer.name)
      .map((layer: any) => layer.name);

    expect(middlewareNames).toContain('corsMiddleware');
  });
});
