-- Lets us sort/filter events chronologically instead of parsing the date back out of the
-- formatted "Termin: ..." text line stored in content (which isn't reliably sortable).
ALTER TABLE "KnowledgeDocument" ADD COLUMN "eventDate" TIMESTAMP(3);
