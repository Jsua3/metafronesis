import { TestBed } from '@angular/core/testing';
import { VOLUME_DEFAULT_LEVEL, VOLUME_STORAGE_KEY, VolumeSettings, clampVolumeLevel } from './volume-settings.service';

describe('VolumeSettings', () => {
  beforeEach(() => { localStorage.removeItem(VOLUME_STORAGE_KEY); TestBed.resetTestingModule(); });
  afterEach(() => localStorage.removeItem(VOLUME_STORAGE_KEY));

  it('sin nada guardado parte del nivel por defecto y sin silencio', () => {
    const settings = TestBed.inject(VolumeSettings);
    expect(settings.musicLevel()).toBe(VOLUME_DEFAULT_LEVEL);
    expect(settings.sfxLevel()).toBe(VOLUME_DEFAULT_LEVEL);
    expect(settings.musicMuted()).toBe(false);
  });

  it('recuerda nivel y silencio entre sesiones', () => {
    const settings = TestBed.inject(VolumeSettings);
    settings.setMusicLevel(3);
    settings.setSfxMuted(true);
    TestBed.resetTestingModule();
    const again = TestBed.inject(VolumeSettings);
    expect(again.musicLevel()).toBe(3);
    expect(again.sfxMuted()).toBe(true);
  });

  it('un valor guardado roto o fuera de rango no rompe el juego', () => {
    localStorage.setItem(VOLUME_STORAGE_KEY, '{roto');
    expect(TestBed.inject(VolumeSettings).musicLevel()).toBe(VOLUME_DEFAULT_LEVEL);
    expect(clampVolumeLevel(42)).toBe(10);
    expect(clampVolumeLevel(-3)).toBe(0);
    expect(clampVolumeLevel(Number.NaN)).toBe(VOLUME_DEFAULT_LEVEL);
  });
});
