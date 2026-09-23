import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LightboxMedia } from './LightboxMedia';

describe('LightboxMedia', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  it('allows native video download while keeping PiP, remote playback and the context menu disabled', () => {
    render(
      <LightboxMedia
        path="channel/video.mp4"
        isAlbum={false}
        albumIndex={0}
        albumPaths={undefined}
        videoRef={{ current: null }}
      />,
    );

    const mediaEl = document.querySelector('video');
    expect(mediaEl).not.toBeNull();
    if (!mediaEl) return;

    expect(mediaEl.hasAttribute('disablePictureInPicture')).toBe(true);
    expect(mediaEl.hasAttribute('disableRemotePlayback')).toBe(true);
    expect(mediaEl.getAttribute('controlsList')).toContain('nopictureinpicture');
    expect(mediaEl.getAttribute('controlsList')).toContain('noremoteplayback');
    expect(mediaEl.getAttribute('controlsList')).not.toContain('nodownload');

    const dispatched = fireEvent.contextMenu(mediaEl);
    expect(dispatched).toBe(false);
  });
});
