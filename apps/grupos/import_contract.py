REQUIRED_STUDENT_IMPORT_COLUMNS = ("nombre", "apellido", "email")
OPTIONAL_STUDENT_IMPORT_COLUMNS = ()
STUDENT_IMPORT_COLUMNS = REQUIRED_STUDENT_IMPORT_COLUMNS + OPTIONAL_STUDENT_IMPORT_COLUMNS

#: Columnas que un archivo viejo puede traer y que se **ignoran** (se informan, nunca se usan):
#: el docente no fija ni ve contraseñas; las cuentas nacen pendientes de aprobación (RN-10, D-5).
IGNORED_STUDENT_IMPORT_COLUMNS = ("password",)

STUDENT_IMPORT_TEMPLATE_FILENAME = "plantilla_importacion_estudiantes_siep.xlsx"
