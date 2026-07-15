-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "key" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("key")
);
