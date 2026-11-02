import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('login() posts the credentials to /api/auth/login and stores the token', () => {
    service.login('demo@example.com', 'Demo1234!').subscribe();

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'demo@example.com', password: 'Demo1234!' });

    req.flush({
      token: 'fake-jwt',
      user: { id: '1', name: 'Demo', email: 'demo@example.com', createdAt: '2026-01-01' },
    });

    expect(service.token()).toBe('fake-jwt');
    expect(service.currentUser()?.name).toBe('Demo');
  });

  it('logout() clears the token and the current user', () => {
    service.token.set('fake-jwt');
    service.currentUser.set({ id: '1', name: 'Demo', email: 'demo@example.com', createdAt: '2026-01-01' });

    service.logout();

    expect(service.token()).toBeNull();
    expect(service.currentUser()).toBeNull();
  });
});
