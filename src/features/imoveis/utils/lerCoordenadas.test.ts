import { describe, expect, it } from 'vitest';
import { lerCoordenadas } from './lerCoordenadas';

describe('lerCoordenadas', () => {
  it('lê o que o Google Maps copia', () => {
    expect(lerCoordenadas('-23.18712, -46.88452')).toEqual([-23.18712, -46.88452]);
    expect(lerCoordenadas('  -23.18712 -46.88452 ')).toEqual([-23.18712, -46.88452]);
  });

  it('lê o link do mapa pelo @, mesmo com outros números antes', () => {
    expect(
      lerCoordenadas('https://www.google.com/maps/place/Rua+X,+123/@-23.1871,-46.8845,17z'),
    ).toEqual([-23.1871, -46.8845]);
  });

  it('recusa um número só, texto e coordenada fora do globo', () => {
    expect(lerCoordenadas('-23.18')).toBeNull();
    expect(lerCoordenadas('Rua das Flores')).toBeNull();
    expect(lerCoordenadas('123, 456')).toBeNull();
  });
});
