import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import {
  getWorkshops,
  addWorkshop,
  updateWorkshop,
  deleteWorkshop,
  getSubWorkshops,
  addSubWorkshop,
  updateSubWorkshop,
  deleteSubWorkshop,
  getSubWorkshopById,
  getTechStacks,
  addTechStack,
  updateTechStack,
  deleteTechStack,
  getTechStackById,
  getFullHierarchy,
  getRoleOptions,
  addRole,
  updateRole,
  deleteRole,
} from "@/lib/dictionaries";

async function getUser(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// GET — получить иерархию или отдельные списки
export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("mode");

  if (mode === "hierarchy") {
    return NextResponse.json({ hierarchy: getFullHierarchy() });
  }

  // По умолчанию — все списки
  return NextResponse.json({
    workshops: getWorkshops(),
    subWorkshops: getSubWorkshops(),
    techStacks: getTechStacks(),
    roles: getRoleOptions(),
  });
}

// POST — добавить запись
export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role === "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { type, name, aliases, parentId, workshopId, subWorkshopId, techStackId, grade } = await request.json();

  if (!type || !name) {
    return NextResponse.json(
      { error: "type и name обязательны" },
      { status: 400 }
    );
  }

  if (type === "workshop") {
    return NextResponse.json(addWorkshop(name, aliases), { status: 201 });
  }
  if (type === "subWorkshop") {
    if (!parentId) {
      return NextResponse.json({ error: "parentId обязателен для подцеха" }, { status: 400 });
    }
    return NextResponse.json(addSubWorkshop(parentId, name, aliases), { status: 201 });
  }
  if (type === "techStack") {
    if (!parentId) {
      return NextResponse.json({ error: "parentId обязателен для стека" }, { status: 400 });
    }
    return NextResponse.json(addTechStack(parentId, name, aliases), { status: 201 });
  }
  if (type === "role") {
    if (!workshopId || !subWorkshopId) {
      return NextResponse.json(
        { error: "Для роли обязательно выберите цех и подцех" },
        { status: 400 }
      );
    }
    const subWorkshop = getSubWorkshopById(subWorkshopId);
    if (!subWorkshop || subWorkshop.workshopId !== workshopId) {
      return NextResponse.json(
        { error: "Подцех должен принадлежать выбранному цеху" },
        { status: 400 }
      );
    }
    const techStack = techStackId ? getTechStackById(techStackId) : undefined;
    if (techStackId && (!techStack || techStack.subWorkshopId !== subWorkshopId)) {
      return NextResponse.json(
        { error: "Стек должен принадлежать выбранному подцеху" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      addRole({ name, workshopId, subWorkshopId, techStackId, grade, aliases }),
      { status: 201 }
    );
  }

  return NextResponse.json({ error: "Неизвестный type" }, { status: 400 });
}

// PUT — обновить запись
export async function PUT(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role === "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { type, id, name, aliases, parentId, workshopId, subWorkshopId, techStackId, grade } = await request.json();

  if (!type || !id || !name) {
    return NextResponse.json(
      { error: "type, id и name обязательны" },
      { status: 400 }
    );
  }

  if (type === "workshop") {
    const entry = updateWorkshop(id, name, aliases);
    return entry
      ? NextResponse.json(entry)
      : NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }
  if (type === "subWorkshop") {
    const entry = updateSubWorkshop(id, name, aliases);
    // Если сменился цех — переносим
    if (entry && parentId && entry.workshopId !== parentId) {
      entry.workshopId = parentId;
    }
    return entry
      ? NextResponse.json(entry)
      : NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }
  if (type === "techStack") {
    const entry = updateTechStack(id, name, aliases);
    if (entry && parentId && entry.subWorkshopId !== parentId) {
      entry.subWorkshopId = parentId;
    }
    return entry
      ? NextResponse.json(entry)
      : NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }
  if (type === "role") {
    if (!workshopId || !subWorkshopId) {
      return NextResponse.json(
        { error: "Для роли обязательно выберите цех и подцех" },
        { status: 400 }
      );
    }
    const subWorkshop = getSubWorkshopById(subWorkshopId);
    if (!subWorkshop || subWorkshop.workshopId !== workshopId) {
      return NextResponse.json(
        { error: "Подцех должен принадлежать выбранному цеху" },
        { status: 400 }
      );
    }
    const techStack = techStackId ? getTechStackById(techStackId) : undefined;
    if (techStackId && (!techStack || techStack.subWorkshopId !== subWorkshopId)) {
      return NextResponse.json(
        { error: "Стек должен принадлежать выбранному подцеху" },
        { status: 400 }
      );
    }
    const entry = updateRole(id, { name, workshopId, subWorkshopId, techStackId, grade, aliases });
    return entry
      ? NextResponse.json(entry)
      : NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  return NextResponse.json({ error: "Неизвестный type" }, { status: 400 });
}

// DELETE — удалить запись
export async function DELETE(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role === "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type");
  const id = searchParams.get("id");

  if (!type || !id) {
    return NextResponse.json(
      { error: "type и id обязательны" },
      { status: 400 }
    );
  }

  let deleted = false;
  if (type === "workshop") deleted = deleteWorkshop(id);
  else if (type === "subWorkshop") deleted = deleteSubWorkshop(id);
  else if (type === "techStack") deleted = deleteTechStack(id);
  else if (type === "role") deleted = deleteRole(id);

  if (!deleted) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
