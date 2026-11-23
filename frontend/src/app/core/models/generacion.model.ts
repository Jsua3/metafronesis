/**
 * Los tipos de la API de generación de casos con IA (`/api/authoring/generations`). Los trae el contrato generado de OpenAPI
 * (`core/api/generated/openapi-contracts.d.ts`); aquí solo se reexportan con los nombres que usa el editor. Manda el generado:
 * sus campos son de solo lectura y `GenerationRepair.round` es un número.
 */
import type {
  Generation,
  GenerationError as GenerationLastError,
  GenerationErrorKindEnum,
  GenerationRepair,
  GenerationSceneError,
  GenerationSceneState,
  GenerationSceneStateStateEnum,
  GenerationSkeleton,
  GenerationSkeletonScene,
  GenerationStartBody,
  GenerationStatus,
  GenerationStatusEnum,
} from '../api/generated/openapi-contracts';

export type {
  Generation, GenerationLastError, GenerationRepair, GenerationSkeleton, GenerationSkeletonScene, GenerationStatus,
};

export type GenerationStatusValue = GenerationStatusEnum;

/** El estado de una escena: `pending`, `running`, `done` o `error`. */
export type GenerationSceneStateValue = GenerationSceneStateStateEnum;

/** Una escena del esqueleto con su avance. Una escena en curso hace más de 150 s llega como `error` con `error.kind: 'timeout'`. */
export type GenerationScene = GenerationSceneState;

/** Por qué falló una etapa: `refusal` es la negativa de la IA (`AI_REFUSED`); las demás vienen de `AI_PROVIDER_ERROR`. */
export type GenerationErrorKind = GenerationErrorKindEnum;

export type GenerationError = GenerationSceneError;

export type GenerationStartRequest = GenerationStartBody;
