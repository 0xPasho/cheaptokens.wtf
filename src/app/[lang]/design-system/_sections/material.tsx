import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Group, Section } from "../_components/section";
export function Material() {
  return <Group id="material" title="Material" description="NibbleRouter: opaque neutral surfaces, 28 px corners and pill controls. Blur belongs only to the fixed navigation.">
    <Section title="Surface materials" description="Flat panels and controls. Compatibility utility names retain the new material everywhere.">
      <div className="grid gap-6 sm:grid-cols-2">
        <Card><CardHeader><CardTitle>Content surface</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><p className="text-muted-foreground">Model descriptions, prices and code sit on opaque surfaces.</p><div className="flex gap-3"><Button>Primary action</Button><Button variant="secondary">Secondary action</Button></div></CardContent></Card>
        <div className="glass-surface rounded-[28px] p-6"><h3 className="font-medium">Floating surface</h3><p className="mt-3 text-muted-foreground">Menus and dialogs use solid neutral fills and subtle borders.</p></div>
      </div>
    </Section>
  </Group>;
}
