// NO SE EDITA A MANO: generado por reglas_de_sala_casos.py.
export const CASOS_DE_REGLAS_DE_SALA = {
 "casos": [
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "sala válida"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": [
          {
           "modelo": "a",
           "muro": "fondo",
           "pos": 50,
           "tipo": "cuadro"
          }
         ]
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "borde exacto"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": [
          {
           "modelo": "a",
           "muro": "fondo",
           "pos": 49,
           "tipo": "cuadro"
          }
         ]
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "La pieza se sale del muro «fondo», que mide 1172 px.",
     "regla": "OCL-13",
     "ruta": "x-siep.escenas[0].mapa.estructura.piezas[0]"
    }
   ],
   "nombre": "borde fuera"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": [
          {
           "modelo": "a",
           "muro": "izquierda",
           "pos": 100,
           "tipo": "cuadro"
          }
         ]
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "Este modelo no puede ir en el muro «izquierda».",
     "regla": "OCL-13",
     "ruta": "x-siep.escenas[0].mapa.estructura.piezas[0]"
    }
   ],
   "nombre": "modelo en muro no admitido"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": [
          {
           "modelo": "a",
           "tipo": "suelo",
           "x": 0,
           "y": 0
          }
         ]
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "La pieza de suelo queda fuera de la zona donde se camina.",
     "regla": "OCL-13",
     "ruta": "x-siep.escenas[0].mapa.estructura.piezas[0]"
    }
   ],
   "nombre": "suelo fuera"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": [
          {
           "modelo": "a",
           "muro": "fondo",
           "pos": 100,
           "tipo": "cuadro"
          },
          {
           "modelo": "a",
           "muro": "fondo",
           "pos": 200,
           "tipo": "cuadro"
          }
         ]
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "piezas se tocan"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": [
          {
           "modelo": "a",
           "muro": "fondo",
           "pos": 100,
           "tipo": "cuadro"
          },
          {
           "modelo": "a",
           "muro": "fondo",
           "pos": 199,
           "tipo": "cuadro"
          }
         ]
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "«a» y «a» se montan una sobre otra en el muro «fondo».",
     "regla": "OCL-14",
     "ruta": "x-siep.escenas[0].mapa.estructura.piezas[0]"
    }
   ],
   "nombre": "piezas chocan"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "una-pared"
        },
        "ancho": 960,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 960,
         "piezas": [
          {
           "modelo": "a",
           "muro": "izquierda",
           "pos": 100,
           "tipo": "cuadro"
          }
         ]
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "La sala no tiene muro «izquierda»: su encuadre no lo incluye.",
     "regla": "OCL-13",
     "ruta": "x-siep.escenas[0].mapa.estructura.piezas[0]"
    }
   ],
   "nombre": "muro ausente"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "pos": 400,
           "sentidoUnico": true,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "No dice en qué muro ni en qué posición va: en una sala por piezas toda pieza y toda puerta lleva «muro» (fondo, izquierda, derecha o cámara) y «pos» (un número entero).",
     "regla": "OCL-13",
     "ruta": "x-siep.escenas[0].mapa.objetos[0]"
    }
   ],
   "nombre": "puerta sin muro"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": [
          {
           "modelo": "a",
           "muro": "fondo",
           "pos": 508,
           "tipo": "cuadro"
          }
         ]
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "sentidoUnico": true,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "holgura de puerta"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": [
          {
           "modelo": "a",
           "muro": "fondo",
           "pos": 507,
           "tipo": "cuadro"
          }
         ]
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "sentidoUnico": true,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "«a» y «puerta» se montan una sobre otra en el muro «fondo».",
     "regla": "OCL-14",
     "ruta": "x-siep.escenas[0].mapa.estructura.piezas[0]"
    }
   ],
   "nombre": "holgura insuficiente"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": [
          {
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "tipo": "tubo"
          }
         ]
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "sentidoUnico": true,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "tubo toca franja"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": [
          {
           "modelo": "alto",
           "muro": "fondo",
           "pos": 400,
           "tipo": "tubo"
          }
         ]
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "sentidoUnico": true,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "tubo separado de puerta"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes",
         "salaId": "s"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "targetNodeKey": "no"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      },
      {
       "clave": "c",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes",
         "salaId": "s"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "c",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "La puerta lleva a una sala que el caso no tiene.",
     "regla": "OCL-15",
     "ruta": "x-siep.escenas[0].mapa.objetos[0]"
    }
   ],
   "nombre": "destino ausente"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes",
         "salaId": "s"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      },
      {
       "clave": "c",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes",
         "salaId": "s"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "c",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "La sala de destino no tiene puerta de regreso; si es de un solo sentido, márcala como de sentido único.",
     "regla": "OCL-15",
     "ruta": "x-siep.escenas[0].mapa.objetos[0]"
    }
   ],
   "nombre": "sin regreso"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes",
         "salaId": "s"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "sentidoUnico": true,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      },
      {
       "clave": "c",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes",
         "salaId": "s"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "c",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "sentido único"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes",
         "salaId": "s"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "muro": "fondo",
           "par": "otra",
           "pos": 400,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      },
      {
       "clave": "c",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes",
         "salaId": "s"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "c",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "La puerta de regreso «otra» no está en la sala de destino.",
     "regla": "OCL-15",
     "ruta": "x-siep.escenas[0].mapa.objetos[0]"
    }
   ],
   "nombre": "par ausente"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes",
         "salaId": "s"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "muro": "fondo",
           "par": "puerta",
           "pos": 400,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "sentidoUnico": true,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "c",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes",
         "salaId": "s"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "c",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "La puerta «puerta» de la sala de destino no vuelve a esta sala.",
     "regla": "OCL-15",
     "ruta": "x-siep.escenas[0].mapa.objetos[0]"
    }
   ],
   "nombre": "par no vuelve"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes",
         "salaId": "s"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "sentidoUnico": true,
           "targetNodeKey": "c"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "c",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes",
         "salaId": "s"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "c",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "regreso misma sala"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "entryX": 400,
           "entryY": 300,
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "sentidoUnico": true,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "llegada libre"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "entryX": 400,
           "entryY": 300,
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "sentidoUnico": true,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "alto": 30,
          "ancho": 30,
          "colision": true,
          "tipo": "PROP",
          "x": 390,
          "y": 280
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "Quien cruza esta puerta aparece en la otra sala sobre una pared o un mueble.",
     "regla": "OCL-16",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos"
    },
    {
     "mensaje": "Quien entra a la sala aparece sobre una pared o un mueble.",
     "regla": "OCL-17",
     "ruta": "x-siep.escenas[1].mapa.aparicion"
    }
   ],
   "nombre": "llegada sobre mueble"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "entryX": 5,
           "entryY": 300,
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "sentidoUnico": true,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "Quien cruza esta puerta aparece en la otra sala sobre una pared o un mueble.",
     "regla": "OCL-16",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos"
    }
   ],
   "nombre": "pie fuera"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "tipo": "PERSON",
          "x": 500,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "persona accesible"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [
         {
          "alto": 528,
          "ancho": 30,
          "x": 700,
          "y": 0
         }
        ],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "tipo": "PERSON",
          "x": 1000,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "No se puede llegar caminando hasta «un objeto» desde la entrada de la sala.",
     "regla": "OCL-17",
     "ruta": "x-siep.escenas[0].mapa.objetos[0]"
    }
   ],
   "nombre": "persona tras muebles"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [
         {
          "alto": 30,
          "ancho": 30,
          "x": 390,
          "y": 280
         }
        ],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "Quien entra a la sala aparece sobre una pared o un mueble.",
     "regla": "OCL-17",
     "ruta": "x-siep.escenas[0].mapa.aparicion"
    }
   ],
   "nombre": "aparición sobre pared"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1920,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1920,
         "piezas": []
        },
        "objetos": [
         {
          "tipo": "PERSON",
          "x": 1800,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "sala ancha accesible"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "otro",
          "paleta": "z",
          "piso": "otro",
          "variante": "z"
         },
         "ancho": 1000,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "desconocida",
           "muro": "fondo",
           "pos": 400,
           "sentidoUnico": true,
           "targetNodeKey": "b"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      },
      {
       "clave": "b",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "b",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "El ancho de la sala no es uno del catálogo (960, 1200, 1440, 1680 o 1920).",
     "regla": "OCL-18",
     "ruta": "x-siep.escenas[0].mapa.estructura.ancho"
    },
    {
     "mensaje": "El piso «otro» en la variante «z» no está en el catálogo.",
     "regla": "OCL-18",
     "ruta": "x-siep.escenas[0].mapa.estructura.acabados"
    },
    {
     "mensaje": "El muro «otro» con la paleta «z» no está en el catálogo.",
     "regla": "OCL-18",
     "ruta": "x-siep.escenas[0].mapa.estructura.acabados"
    },
    {
     "mensaje": "La puerta de modelo «desconocida» no está en el catálogo.",
     "regla": "OCL-18",
     "ruta": "x-siep.escenas[0].mapa.objetos[0]"
    }
   ],
   "nombre": "catálogo desconocido"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": []
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "El catálogo de piezas de la biblioteca no está disponible: no se pueden revisar las salas por piezas.",
     "regla": "OCL-18",
     "ruta": "x-siep.escenas"
    }
   ],
   "nombre": "sin catálogo",
   "sinCatalogo": true
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "apoyo": "pies",
           "movimiento": {
            "modo": "circuito",
            "puntos": [
             {
              "x": 600,
              "y": 300
             },
             {
              "x": 600,
              "y": 400
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": 300,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "trayecto libre"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [
         {
          "alto": 100,
          "ancho": 30,
          "x": 440,
          "y": 250
         }
        ],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "apoyo": "pies",
           "movimiento": {
            "modo": "circuito",
            "puntos": [
             {
              "x": 600,
              "y": 300
             },
             {
              "x": 600,
              "y": 400
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": 300,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "El camino recto hasta este punto atraviesa un mueble, una pared u otra persona: la persona camina en línea recta entre sus puntos; agrega un punto intermedio para rodearlo.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento.puntos[0]"
    },
    {
     "mensaje": "El camino recto de regreso a la partida atraviesa un mueble, una pared u otra persona: agrega un punto intermedio para rodearlo.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento"
    }
   ],
   "nombre": "trayecto atraviesa mueble"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [
         {
          "alto": 100,
          "ancho": 30,
          "x": 440,
          "y": 250
         }
        ],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "apoyo": "pies",
           "movimiento": {
            "modo": "circuito",
            "puntos": [
             {
              "x": 455,
              "y": 300
             },
             {
              "x": 600,
              "y": 400
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": 300,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "El punto queda fuera de la zona caminable, sobre un mueble o sobre otra persona.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento.puntos[0]"
    },
    {
     "mensaje": "El camino recto de regreso a la partida atraviesa un mueble, una pared u otra persona: agrega un punto intermedio para rodearlo.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento"
    }
   ],
   "nombre": "punto sobre mueble"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "apoyo": "pies",
           "movimiento": {
            "modo": "circuito",
            "puntos": [
             {
              "x": 600,
              "y": 300
             },
             {
              "x": 600,
              "y": 400
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": 300,
          "y": 300
         },
         {
          "clave": "puerta",
          "metadatos": {
           "modelo": "a",
           "muro": "fondo",
           "pos": 400,
           "sentidoUnico": true,
           "targetNodeKey": "a"
          },
          "tipo": "EXIT",
          "x": 400,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "La persona pasaría frente a la puerta «puerta» y la taparía: aleja el trayecto al menos 56 px de la puerta.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento.puntos[0]"
    }
   ],
   "nombre": "trayecto tapa puerta"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [
         {
          "alto": 20,
          "ancho": 20,
          "x": 440,
          "y": 365
         }
        ],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "apoyo": "pies",
           "movimiento": {
            "modo": "circuito",
            "puntos": [
             {
              "x": 600,
              "y": 300
             },
             {
              "x": 600,
              "y": 450
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": 300,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "El camino recto de regreso a la partida atraviesa un mueble, una pared u otra persona: agrega un punto intermedio para rodearlo.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento"
    }
   ],
   "nombre": "regreso del circuito choca"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [
         {
          "alto": 20,
          "ancho": 20,
          "x": 440,
          "y": 365
         }
        ],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "apoyo": "pies",
           "movimiento": {
            "modo": "ida-y-vuelta",
            "puntos": [
             {
              "x": 600,
              "y": 300
             },
             {
              "x": 600,
              "y": 450
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": 300,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "ida y vuelta sin regreso"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "apoyo": "pies",
           "movimiento": {
            "modo": "circuito",
            "puntos": [
             {
              "x": 600,
              "y": 300
             },
             {
              "x": 600,
              "y": 400
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": 300,
          "y": 300
         },
         {
          "clave": "otra",
          "metadatos": {
           "apoyo": "pies"
          },
          "tipo": "PERSON",
          "x": 450,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "El camino recto hasta este punto atraviesa un mueble, una pared u otra persona: la persona camina en línea recta entre sus puntos; agrega un punto intermedio para rodearlo.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento.puntos[0]"
    }
   ],
   "nombre": "otra persona en medio"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "apoyo": "pies",
           "movimiento": {
            "modo": "circuito",
            "puntos": [
             {
              "x": 600,
              "y": 300
             },
             {
              "x": 600,
              "y": 400
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": 300,
          "y": 200
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "La partida de la persona queda fuera de la zona caminable, sobre un mueble o sobre otra persona.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento"
    }
   ],
   "nombre": "partida fuera de la zona"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [
         {
          "alto": 8,
          "ancho": 30,
          "x": 440,
          "y": 302
         }
        ],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "apoyo": "pies",
           "movimiento": {
            "modo": "circuito",
            "puntos": [
             {
              "x": 600,
              "y": 300
             },
             {
              "x": 600,
              "y": 400
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": 300,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [],
   "nombre": "apoyo en los pies"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [
         {
          "alto": 8,
          "ancho": 30,
          "x": 440,
          "y": 302
         }
        ],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "movimiento": {
            "modo": "circuito",
            "puntos": [
             {
              "x": 600,
              "y": 300
             },
             {
              "x": 600,
              "y": 400
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": 300,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "El camino recto hasta este punto atraviesa un mueble, una pared u otra persona: la persona camina en línea recta entre sus puntos; agrega un punto intermedio para rodearlo.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento.puntos[0]"
    }
   ],
   "nombre": "apoyo de antes"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "apoyo": "pies",
           "movimiento": {
            "modo": "circuito",
            "puntos": [
             {
              "x": 600,
              "y": 300
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": 300,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "El trayecto requiere de 2 a 8 puntos válidos, un modo válido y una pausa entre 0 y 10000 ms.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento"
    }
   ],
   "nombre": "trayecto mal formado"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "apoyo": "pies",
           "movimiento": {
            "modo": "circuito",
            "pausaMs": 10001,
            "puntos": [
             {
              "x": 600,
              "y": 300
             },
             {
              "x": 600,
              "y": 400
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": 300,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "El trayecto requiere de 2 a 8 puntos válidos, un modo válido y una pausa entre 0 y 10000 ms.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento"
    }
   ],
   "nombre": "pausa fuera de rango"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [],
        "estructura": {
         "acabados": {
          "muro": "liso",
          "paleta": "blanco",
          "piso": "vinilo"
         },
         "ancho": 1440,
         "piezas": []
        },
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "apoyo": "pies",
           "movimiento": {
            "modo": "circuito",
            "puntos": [
             {
              "x": 600,
              "y": 300
             },
             {
              "x": 600,
              "y": 400
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": null,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "No se puede comprobar el trayecto sin las medidas de la sala y la posición de la persona.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento"
    }
   ],
   "nombre": "trayecto sin posición"
  },
  {
   "documento": {
    "x-siep": {
     "escenas": [
      {
       "clave": "a",
       "mapa": {
        "alto": 528,
        "ambiente": {
         "encuadre": "tres-paredes"
        },
        "ancho": 1440,
        "aparicion": {
         "x": 400,
         "y": 300
        },
        "clave": "a",
        "colisiones": [
         {
          "alto": 100,
          "ancho": 30,
          "x": 440,
          "y": 250
         }
        ],
        "objetos": [
         {
          "clave": "caminante",
          "etiqueta": "Caminante",
          "metadatos": {
           "apoyo": "pies",
           "movimiento": {
            "modo": "circuito",
            "puntos": [
             {
              "x": 600,
              "y": 300
             },
             {
              "x": 600,
              "y": 400
             }
            ],
            "tipo": "ruta"
           }
          },
          "tipo": "PERSON",
          "x": 300,
          "y": 300
         }
        ]
       }
      }
     ]
    }
   },
   "hallazgos": [
    {
     "mensaje": "El camino recto hasta este punto atraviesa un mueble, una pared u otra persona: la persona camina en línea recta entre sus puntos; agrega un punto intermedio para rodearlo.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento.puntos[0]"
    },
    {
     "mensaje": "El camino recto de regreso a la partida atraviesa un mueble, una pared u otra persona: agrega un punto intermedio para rodearlo.",
     "regla": "OCL-19",
     "ruta": "x-siep.escenas[0].mapa.objetos[0].metadatos.movimiento"
    }
   ],
   "nombre": "trayecto en sala sin estructura"
  }
 ],
 "catalogo": {
  "anchos": [
   960,
   1200,
   1440,
   1680,
   1920
  ],
  "clavesDePisos": [
   "vinilo-a"
  ],
  "muros": [
   "liso/blanco"
  ],
  "piezas": {
   "cuadro/a": {
    "franja": [
     20,
     100
    ],
    "muros": [
     "fondo"
    ],
    "ocupa": 100
   },
   "puerta/a": {
    "franja": [
     0,
     200
    ],
    "muros": [
     "fondo",
     "izquierda",
     "derecha"
    ],
    "ocupa": 100
   },
   "suelo/a": {
    "franja": [
     0,
     20
    ],
    "muros": [
     "suelo"
    ],
    "ocupa": 20
   },
   "tubo/a": {
    "franja": [
     200,
     240
    ],
    "muros": [
     "fondo"
    ],
    "ocupa": 100
   },
   "tubo/alto": {
    "franja": [
     210,
     240
    ],
    "muros": [
     "fondo"
    ],
    "ocupa": 100
   }
  },
  "propios": [
   "propio.png"
  ],
  "tapetes": [
   "tapete.png"
  ]
 }
} as const;
